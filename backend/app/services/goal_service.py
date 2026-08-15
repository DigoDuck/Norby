from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import Transaction, TransactionType, Goal, GoalType
from app.schemas.goal import GoalResponse


def current_month_range(now: date | datetime | None = None) -> tuple[date, date]:
    """Intervalo [início do mês, início do mês seguinte) da referência, como `date`.

    Retorna `date` (não `datetime` tz-aware) de propósito: `Transaction.date` é uma
    coluna DATE, e comparar date-com-date evita o cast implícito para timestamptz no
    timezone da sessão do Postgres. Aceita datetime, date ou None (usa agora, UTC).
    """
    now = now or datetime.now(timezone.utc)
    start = date(now.year, now.month, 1)
    if now.month == 12:
        end = date(now.year + 1, 1, 1)
    else:
        end = date(now.year, now.month + 1, 1)
    return start, end


async def month_spent(db: AsyncSession, user_id, category: str) -> Decimal:
    start, end = current_month_range()
    total = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category == category,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )).scalar_one()
    return Decimal(str(total))


async def month_spent_by_category(db: AsyncSession, user_id, categories) -> dict[str, Decimal]:
    """Gasto do mês por categoria, em UMA query, para uma lista de categorias.

    Existe para a listagem de metas: chamar `month_spent` por meta fazia um
    round-trip por orçamento (N+1). Com 15 metas BUDGET eram 16 idas ao banco em
    sequência, o que num Postgres serverless em outra região é a diferença entre
    dezenas e centenas de milissegundos.
    """
    categorias = [c for c in set(categories) if c]
    if not categorias:
        return {}
    start, end = current_month_range()
    linhas = (await db.execute(
        select(Transaction.category, func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category.in_(categorias),
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category)
    )).all()
    return {categoria: Decimal(str(total)) for categoria, total in linhas}


async def build_goal_response(
    db: AsyncSession, goal: Goal, *, gasto_do_mes: Decimal | None = None
) -> GoalResponse:
    """Monta a resposta de uma meta.

    `gasto_do_mes` permite ao chamador entregar o total já calculado em lote
    (ver `month_spent_by_category`); sem ele, a meta de orçamento consulta
    sozinha, que é o caminho das rotas de item único.
    """
    if goal.type == GoalType.SAVINGS:
        current = goal.current_amount
    elif gasto_do_mes is not None:
        current = gasto_do_mes
    else:
        current = await month_spent(db, goal.user_id, goal.category)

    target = goal.target_amount
    progress = float(current / target * 100) if target and target > 0 else 0.0
    return GoalResponse(
        id=goal.id,
        name=goal.name,
        type=goal.type,
        target_amount=target,
        current_amount=current,
        category=goal.category,
        deadline=goal.deadline,
        created_at=goal.created_at,
        progress_pct=round(progress, 1),
        remaining=target - current,
    )
