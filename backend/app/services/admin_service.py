"""Área de admin (issue #23, ADR 0004).

As três ações REUSAM o que já existe e já é testado: `delete_account` (Stripe
primeiro, recusa aborta tudo), `cancel_subscription` (imediato) e
`create_password_reset`. O que este módulo acrescenta é a auditoria e as
métricas. Service não conhece HTTP: as exceções daqui viram status no router.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import AdminAction, AiUsageDaily, User
from app.services.account_service import delete_account
from app.services.ai_service import dia_da_cota
from app.services.auth_service import create_password_reset
from app.services.billing_service import (
    aplicar_assinatura,
    cancel_subscription,
    fetch_subscription,
)

logger = logging.getLogger(__name__)

# Limite de requisições por dia do projeto Gemini no tier gratuito (ADR 0003),
# só para a tela mostrar "X de 500". Não é aplicado em lugar nenhum: quem
# aplica por usuário é a cota diária do ai_service.
PROJECT_RPD = 500
PRECO_MENSAL_BRL = 20
LIMITE_LISTA = 500


class SemAssinatura(Exception):
    """Cancelar quem não tem assinatura no Stripe. Router traduz para 409."""


async def listar_usuarios(db: AsyncSession) -> list[User]:
    # Todos, mais novos primeiro. Paginação quando a base passar do teto; hoje
    # a lista inteira cabe numa resposta e o filtro é no cliente.
    return list(
        (await db.execute(select(User).order_by(User.created_at.desc()).limit(LIMITE_LISTA))).scalars()
    )


async def metricas(db: AsyncSession) -> dict:
    """Uma consulta com `count(*) filter`, ao vivo. A base é pequena; cache
    e agregação entram no dia em que este `count` doer."""
    agora = datetime.now(timezone.utc)
    sem_premium = or_(User.premium_until.is_(None), User.premium_until <= agora)
    linha = (
        await db.execute(
            select(
                func.count(User.id).label("users"),
                func.count(User.id).filter(User.premium_until > agora).label("premium"),
                func.count(User.id).filter(User.premium_until <= agora).label("expired"),
                func.count(User.id).filter(User.ai_trial_ends_at > agora, sem_premium).label("trial"),
            )
        )
    ).one()
    chamadas_hoje = (
        await db.execute(
            select(func.coalesce(func.sum(AiUsageDaily.calls), 0)).where(
                AiUsageDaily.day == dia_da_cota()
            )
        )
    ).scalar_one()
    return {
        "users": linha.users,
        "premium": linha.premium,
        "trial": linha.trial,
        "expired": linha.expired,
        "mrr_brl": linha.premium * PRECO_MENSAL_BRL,
        "ai_calls_today": int(chamadas_hoje),
        "ai_calls_project_limit": PROJECT_RPD,
    }


async def _registrar(
    db: AsyncSession, *, admin_id: uuid.UUID, acao: str, alvo_id: uuid.UUID, alvo_email: str,
    detail: dict | None = None,
) -> None:
    # admin_id em vez de `admin: User`, de propósito: um `db.rollback()` (ver
    # `cancelar_assinatura`) expira TODOS os objetos ORM da sessão, e reler
    # `admin.id` depois disso estoura MissingGreenlet. O id já é um valor
    # simples, sem esse risco — mesma razão de `alvo_id`/`alvo_email` abaixo.
    #
    # DEPOIS da ação, em commit próprio: ação que falhou não deixa linha, e a
    # linha não depende de o alvo ainda existir (ver AdminAction).
    db.add(AdminAction(
        admin_id=admin_id, action=acao, target_user_id=alvo_id,
        target_email=alvo_email, detail=detail,
    ))
    await db.commit()


async def cancelar_assinatura(db: AsyncSession, *, admin: User, alvo: User) -> None:
    """Cancela no Stripe na hora e aplica o estado que o Stripe devolve.

    Imediato, e não no fim do período: o caminho normal de quem quer cancelar
    é o Customer Portal. Este é o excepcional (fraude, chargeback, pessoa que
    não consegue usar o Portal), e a assinatura tem que parar agora. Aplicar
    pelo `aplicar_assinatura` faz o acesso cair sem esperar o webhook.
    """
    if not alvo.stripe_subscription_id:
        raise SemAssinatura()
    sub_id = alvo.stripe_subscription_id
    # Capturados ANTES do try: um `db.rollback()` no except expira os
    # atributos do objeto ORM, e reler um atributo expirado fora de um
    # `await` explícito estoura MissingGreenlet no SQLAlchemy async.
    admin_id, alvo_id, alvo_email = admin.id, alvo.id, alvo.email
    await cancel_subscription(sub_id)  # GatewayCancelFailed sobe até o router

    # A partir daqui o Stripe JÁ cancelou. Se o fetch ou o commit falharem
    # (rede, 5xx), o cancelamento não pode virar erro 500 nem ficar sem
    # auditoria: ele aconteceu. Sem esta guarda, o admin tentaria de novo, o
    # Stripe recusaria cancelar uma assinatura já cancelada
    # (GatewayCancelFailed para sempre), e a linha de auditoria de uma ação
    # que de fato ocorreu nunca seria escrita. O webhook
    # `customer.subscription.deleted` fecha `premium_until` quando chegar.
    detail = {"stripe_subscription_id": sub_id}
    try:
        aplicar_assinatura(alvo, await fetch_subscription(sub_id))
        await db.commit()
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 5xx do Stripe
        await db.rollback()
        logger.warning(
            "admin: assinatura %s cancelada no Stripe mas o fetch/aplicação falhou "
            "para o usuário %s: %s", sub_id, alvo_id, erro,
        )
        detail["aplicado"] = False

    await _registrar(
        db, admin_id=admin_id, acao="cancel_subscription", alvo_id=alvo_id, alvo_email=alvo_email,
        detail=detail,
    )


async def excluir_conta(db: AsyncSession, *, admin: User, alvo: User) -> None:
    admin_id, alvo_id, alvo_email = admin.id, alvo.id, alvo.email
    await delete_account(alvo, db)  # Stripe primeiro; GatewayCancelFailed sobe
    await _registrar(db, admin_id=admin_id, acao="delete_account", alvo_id=alvo_id, alvo_email=alvo_email)


async def preparar_recuperacao(db: AsyncSession, *, admin: User, alvo: User, base_url: str, rota: str) -> str:
    """Cria o token e devolve o link. Quem ENVIA é o router, em background,
    pelo mesmo helper do /auth/forgot-password: o service não conhece
    BackgroundTasks."""
    admin_id, alvo_id, alvo_email = admin.id, alvo.id, alvo.email
    raw = await create_password_reset(str(alvo_id), db)
    await _registrar(db, admin_id=admin_id, acao="send_recovery_email", alvo_id=alvo_id, alvo_email=alvo_email)
    return f"{base_url.rstrip('/')}{rota}?token={raw}"
