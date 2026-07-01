from decimal import Decimal

from app.models.sql_models import TransactionType
from app.services.transaction_service import signed_delta


def test_signed_delta_income_is_positive():
    assert signed_delta(TransactionType.INCOME, Decimal("30.00")) == Decimal("30.00")


def test_signed_delta_expense_is_negative():
    assert signed_delta(TransactionType.EXPENSE, Decimal("30.00")) == Decimal("-30.00")
