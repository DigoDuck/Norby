"""Aplicação dos eventos de assinatura do Stripe (issue #45, ADR 0001).

O que o Stripe manda vira colunas em `users`. Nada aqui autoriza: quem autoriza
é `plan_service`, lendo `premium_until`.

Recebe **dict puro**, nunca `StripeObject`: o SDK para no router, no papel de
verificador de assinatura. É isso que mantém a troca de gateway sendo um dos
quatro pontos de acoplamento que o ADR nomeia.
"""

import logging
import uuid
from datetime import datetime, timezone

import stripe

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import StripeWebhookEvent, User

logger = logging.getLogger("norby.billing")

# `created` entrou junto do `updated` depois que a implementação mostrou o furo:
# o `checkout.session.completed` NÃO traz `current_period_end`, e quem carrega o
# período da PRIMEIRA assinatura é o `created`. Sem ele, o premium_until da
# primeira compra só chegaria na primeira renovação. Mesmo handler para os três:
# todos trazem o objeto completo da assinatura.
EVENTOS_ASSINATURA = frozenset(
    {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }
)
EVENTO_CHECKOUT = "checkout.session.completed"


def _instante(epoch: int | None) -> datetime | None:
    return datetime.fromtimestamp(epoch, timezone.utc) if epoch else None


def _projecao(evento: dict) -> dict:
    """Só os campos que este handler lê — nunca o payload cru.

    O `checkout.session.completed` traz `customer_details.email`; guardar o
    evento inteiro colocaria PII fora do alcance do `delete_account`.
    """
    obj = evento.get("data", {}).get("object", {}) or {}
    tipo = evento.get("type", "")
    return {
        "event_id": evento["id"],
        "type": tipo,
        "stripe_created": _instante(evento.get("created")),
        "customer_id": obj.get("customer"),
        "subscription_id": obj.get("subscription") if tipo == EVENTO_CHECKOUT else obj.get("id"),
        "current_period_end": _instante(obj.get("current_period_end")),
        "status": obj.get("status"),
        "cancel_at_period_end": obj.get("cancel_at_period_end"),
        "received_at": datetime.now(timezone.utc),
    }


async def _registrar(dados: dict, db: AsyncSession) -> bool:
    """Grava o evento. False quando já existe — reentrega do Stripe.

    Upsert atômico em vez de SELECT-depois-INSERT: o Stripe pode entregar a
    mesma reentrega duas vezes em paralelo, e o read-modify-write deixaria as
    duas passarem pelo SELECT e a segunda estourar a PK como IntegrityError.
    """
    inserido = await db.scalar(
        pg_insert(StripeWebhookEvent)
        .values(**dados)
        .on_conflict_do_nothing(index_elements=[StripeWebhookEvent.event_id])
        .returning(StripeWebhookEvent.event_id)
    )
    return inserido is not None


async def _dono(evento: dict, dados: dict, db: AsyncSession) -> User | None:
    """Acha o usuário do evento.

    O checkout casa por `client_reference_id` (o id do usuário, carimbado por
    nós na criação da sessão) porque é a ÚNICA vez que o Stripe ainda não sabe
    quem é a pessoa. Dali em diante casa por `stripe_customer_id`.
    """
    if evento.get("type") == EVENTO_CHECKOUT:
        referencia = (evento.get("data", {}).get("object", {}) or {}).get("client_reference_id")
        try:
            user_id = uuid.UUID(str(referencia))
        except (ValueError, TypeError):
            return None
        return await db.scalar(select(User).where(User.id == user_id))

    if not dados["customer_id"]:
        return None
    return await db.scalar(
        select(User).where(User.stripe_customer_id == dados["customer_id"])
    )


def _aplicar(user: User, evento: dict, dados: dict) -> None:
    if evento["type"] == EVENTO_CHECKOUT:
        # O checkout só AMARRA os ids: ele não traz período nenhum. Quem move o
        # portão é o customer.subscription.created que vem junto.
        user.stripe_customer_id = dados["customer_id"] or user.stripe_customer_id
        user.stripe_subscription_id = dados["subscription_id"] or user.stripe_subscription_id
        return

    user.stripe_subscription_id = dados["subscription_id"]
    user.subscription_status = dados["status"]
    user.cancel_at_period_end = bool(dados["cancel_at_period_end"])

    if evento["type"] == "customer.subscription.deleted":
        # `ended_at` é quando a assinatura REALMENTE acabou. Num cancelamento
        # imediato ele é agora, enquanto `current_period_end` ainda aponta para
        # o futuro — usar o período aqui deixaria acesso pago em pé depois do
        # fim. Cai para o período quando o Stripe omite o ended_at.
        fim = (evento.get("data", {}).get("object", {}) or {}).get("ended_at")
        user.premium_until = _instante(fim) or dados["current_period_end"]
        return

    user.premium_until = dados["current_period_end"]


async def handle_event(evento: dict, db: AsyncSession) -> None:
    """Idempotente, tolerante a chegada fora de ordem, e nunca levanta por
    evento que não interessa. Quem não é tratado ainda assim fica gravado."""
    dados = _projecao(evento)

    if not await _registrar(dados, db):
        logger.info("stripe: evento %s reentregue, ignorado", dados["event_id"])
        await db.rollback()
        return

    tipo = evento.get("type")
    if tipo not in EVENTOS_ASSINATURA and tipo != EVENTO_CHECKOUT:
        # Assinamos só quatro tipos no painel, mas alguém pode ligar outro sem
        # avisar. Gravado e não processado, em vez de 500 e reentrega por 3 dias.
        await db.commit()
        return

    user = await _dono(evento, dados, db)
    if user is None:
        # processed_at fica NULO: é a trilha de auditoria de "não casou com
        # ninguém" (`WHERE processed_at IS NULL`). Responder não-2xx faria o
        # Stripe reentregar por 3 dias um evento que nunca vai casar.
        logger.warning(
            "stripe: evento %s (%s) sem usuário correspondente, customer=%s",
            dados["event_id"], tipo, dados["customer_id"],
        )
        await db.commit()
        return

    # A marca d'água de ordem vale SÓ para eventos de assinatura, porque só eles
    # escrevem premium_until — que é o que a guarda existe para proteger. O
    # checkout ficar de fora não é detalhe: o Stripe cria a assinatura ANTES de
    # a sessão completar, então `subscription.created` costuma trazer um
    # `created` MENOR que o do checkout. Se o checkout movesse a marca, o evento
    # que carrega o período entraria como atrasado e o portão nunca abriria na
    # primeira compra. Amarrar ids é idempotente, então checkout velho é inócuo.
    if tipo in EVENTOS_ASSINATURA:
        if user.stripe_event_at and dados["stripe_created"] < user.stripe_event_at:
            # Visto e descartado de propósito — diferente de não ter dono, por
            # isso ganha processed_at.
            logger.info("stripe: evento %s fora de ordem, descartado", dados["event_id"])
            await _marcar_processado(dados["event_id"], db)
            return
        user.stripe_event_at = dados["stripe_created"]

    _aplicar(user, evento, dados)
    await _marcar_processado(dados["event_id"], db)


async def _marcar_processado(event_id: str, db: AsyncSession) -> None:
    linha = await db.get(StripeWebhookEvent, event_id)
    if linha is not None:
        linha.processed_at = datetime.now(timezone.utc)
    await db.commit()


class GatewayCancelFailed(Exception):
    """O gateway recusou o cancelamento. Quem traduz para HTTP é o router —
    service neste repo não conhece HTTP."""


async def cancel_subscription(subscription_id: str) -> None:
    """Cancela a assinatura no Stripe.

    Única saída para o Stripe neste ticket, e é ela que os testes stubam. Usa
    a API assíncrona do SDK em vez de `asyncio.to_thread`: a versão síncrona
    faria uma chamada HTTP bloqueante travar o event loop.
    """
    try:
        await stripe.Subscription.cancel_async(subscription_id)
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 4xx do Stripe
        raise GatewayCancelFailed(str(erro)) from erro
