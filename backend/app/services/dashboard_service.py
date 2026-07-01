"""Resumo agregado do Dashboard, calculado no Postgres.

O Dashboard antes montava KPIs, fluxo de caixa e categorias no cliente, em cima
das 200 transações mais recentes que a listagem devolvia — para usuário ativo os
números ficavam errados sem aviso. Aqui a agregação é feita no banco, sobre todas
as transações do usuário.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import Transaction, TransactionType
from app.schemas.dashboard import CashFlowPoint, CategorySlice, DashboardSummary
from app.services.goal_service import current_month_range

CASH_FLOW_MONTHS = 6
TOP_CATEGORIES = 5

# Soma condicional por tipo, reutilizada nos agregados.
_income_sum = func.coalesce(
    func.sum(case((Transaction.type == TransactionType.INCOME, Transaction.amount), else_=0)), 0
)
_expense_sum = func.coalesce(
    func.sum(case((Transaction.type == TransactionType.EXPENSE, Transaction.amount), else_=0)), 0
)


async def _income_expense(db: AsyncSession, user_id, start: date, end: date) -> tuple[Decimal, Decimal]:
    row = (await db.execute(
        select(_income_sum.label("income"), _expense_sum.label("expenses")).where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )).one()
    return Decimal(str(row.income)), Decimal(str(row.expenses))


async def get_dashboard_summary(db: AsyncSession, user_id) -> DashboardSummary:
    start, end = current_month_range()
    prev_start, _ = current_month_range(start - timedelta(days=1))

    month_income, month_expenses = await _income_expense(db, user_id, start, end)
    prev_month_income, prev_month_expenses = await _income_expense(db, user_id, prev_start, start)

    # Fluxo de caixa: agrupa por mês sobre TODAS as transações, pega os 6 últimos
    # meses com dados (desc + limit) e devolve em ordem cronológica.
    month_col = func.date_trunc("month", Transaction.date)
    cash_rows = (await db.execute(
        select(
            month_col.label("m"),
            _income_sum.label("income"),
            _expense_sum.label("expenses"),
        )
        .where(Transaction.user_id == user_id)
        .group_by(month_col)
        .order_by(month_col.desc())
        .limit(CASH_FLOW_MONTHS)
    )).all()
    cash_flow = [
        CashFlowPoint(month=r.m.strftime("%Y-%m"), income=r.income, expenses=r.expenses)
        for r in reversed(cash_rows)
    ]

    # Top categorias de despesa do mês atual.
    cat_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(TOP_CATEGORIES)
    )).all()
    top_categories = [CategorySlice(category=r.category, total=r.total) for r in cat_rows]

    return DashboardSummary(
        month_income=month_income,
        month_expenses=month_expenses,
        prev_month_income=prev_month_income,
        prev_month_expenses=prev_month_expenses,
        cash_flow=cash_flow,
        top_categories=top_categories,
    )
