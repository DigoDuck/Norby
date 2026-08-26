"""Resolução de carteira com ownership e teto de plano (ADR 0002, issue #86).

Este módulo existe para que o teto seja **impossível de esquecer**. Antes havia
três cópias de `_get_owned_wallet` (wallets, transactions, recurring) com
assinaturas diferentes, e três lugares para lembrar de uma regra é exatamente o
mecanismo pelo qual alguém esquece. Agora quem quiser uma carteira passa por
aqui, e passar por aqui já roda a regra.

Dependency do FastAPI não serviria: em `POST /transactions` e `POST /recurring`
o `wallet_id` chega no CORPO, e dependency lê path e query. Cobriria só as rotas
`/{wallet_id}` — justamente as que menos importam.
"""

from uuid import UUID

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.sql_models import User, Wallet
from app.services.plan_service import PlanRefused, wallet_cap_active

# Decisão travada do #15: gratuito = 2 carteiras, e as 2 MAIS ANTIGAS nunca são
# bloqueadas.
LIMITE_FREE = 2


class WalletNotFound(Exception):
    """Carteira inexistente ou de outro dono. Vira 404 no handler do main.

    Os dois casos respondem igual de propósito: dizer "existe, mas não é sua"
    transformaria a rota num oráculo de ids alheios.
    """


def _anteriores_subquery():
    """Quantas carteiras do mesmo dono são mais antigas que esta.

    **Desvio consciente do ADR 0002**, que dizia `row_number() over (...)`: o
    Postgres recusa `FOR UPDATE` junto de window function ("FOR UPDATE is not
    allowed with window functions"), e a carteira PRECISA de lock quando o
    saldo vai mudar. Uma subquery escalar correlacionada entrega a mesma
    informação, com o mesmo desempate, na mesma viagem, e convive com o lock.

    O desempate por `id` não é enfeite: `created_at` empata (o seed de demo cria
    carteiras na mesma transação), e ordem instável faria o conjunto bloqueado
    mudar entre requisições — a pessoa escreveria numa carteira e levaria 403 na
    seguinte, sem nada ter mudado.
    """
    outra = aliased(Wallet)
    return (
        select(func.count())
        .select_from(outra)
        .where(outra.user_id == Wallet.user_id)
        .where(tuple_(outra.created_at, outra.id) < tuple_(Wallet.created_at, Wallet.id))
        .scalar_subquery()
    )


async def get_owned_wallet(
    wallet_id: UUID,
    user: User,
    db: AsyncSession,
    *,
    for_update: bool = False,
    required: bool = True,
    for_write: bool = False,
) -> Wallet | None:
    """Carteira do usuário, com o teto aplicado quando `for_write`.

    - `for_update`: trava a linha (`FOR UPDATE`) para mutar saldo com segurança.
    - `required=False`: devolve None em vez de levantar, usado na carteira de
      origem de um update, cujo efeito antigo é revertido de forma tolerante.
    - `for_write`: liga o teto. Leitura NUNCA é bloqueada — carteira excedente
      continua visível e continua contando em todo total.
    """
    stmt = (
        select(Wallet, _anteriores_subquery())
        .where(Wallet.id == wallet_id, Wallet.user_id == user.id)
    )
    if for_update:
        # `of=Wallet`: sem isso o Postgres tentaria travar o alias da subquery.
        stmt = stmt.with_for_update(of=Wallet)

    linha = (await db.execute(stmt)).first()
    if linha is None:
        if required:
            raise WalletNotFound()
        return None

    wallet, anteriores = linha
    if for_write and anteriores >= LIMITE_FREE and wallet_cap_active(user):
        raise PlanRefused(
            "WALLET_READ_ONLY",
            "Esta carteira está somente-leitura no plano gratuito. "
            "Ela continua visível e contando nos seus totais.",
        )
    return wallet


async def ensure_can_create_wallet(user: User, db: AsyncSession) -> None:
    """Recusa a criação quando o usuário já está no teto."""
    if not wallet_cap_active(user):
        return
    quantas = await db.scalar(
        select(func.count()).select_from(Wallet).where(Wallet.user_id == user.id)
    )
    if quantas >= LIMITE_FREE:
        raise PlanRefused(
            "WALLET_LIMIT_REACHED",
            f"O plano gratuito permite {LIMITE_FREE} carteiras.",
        )
