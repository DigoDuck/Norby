from decimal import Decimal

from pydantic import BaseModel


class CashFlowPoint(BaseModel):
    month: str  # chave ano-mês, ex.: "2026-07" (o front formata o rótulo)
    income: Decimal
    expenses: Decimal


class CategorySlice(BaseModel):
    category: str
    total: Decimal


class DashboardSummary(BaseModel):
    month_income: Decimal
    month_expenses: Decimal
    prev_month_income: Decimal
    prev_month_expenses: Decimal
    cash_flow: list[CashFlowPoint]  # até 6 meses com dados, cronológico
    top_categories: list[CategorySlice]  # top 5 despesas do mês atual
