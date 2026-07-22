"""add financial check constraints

Revision ID: a1b2c3d4e5f6
Revises: d1e2f3a4b5c6
Create Date: 2026-07-21 00:00:00.000000

As regras de valor viviam só no Pydantic. Qualquer escrita fora da API podia
gravar amount negativo e quebrar o saldo em silêncio. Aqui elas passam a ser
invariantes do próprio banco.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_transactions_amount_positive", "transactions", "amount > 0"
    )
    op.create_check_constraint(
        "ck_recurring_amount_positive", "recurring_transactions", "amount > 0"
    )
    op.create_check_constraint(
        "ck_recurring_day_of_month",
        "recurring_transactions",
        "day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28)",
    )
    op.create_check_constraint(
        "ck_recurring_weekday",
        "recurring_transactions",
        "weekday IS NULL OR (weekday BETWEEN 0 AND 6)",
    )
    op.create_check_constraint(
        "ck_goals_target_positive", "goals", "target_amount > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_goals_target_positive", "goals", type_="check")
    op.drop_constraint("ck_recurring_weekday", "recurring_transactions", type_="check")
    op.drop_constraint("ck_recurring_day_of_month", "recurring_transactions", type_="check")
    op.drop_constraint("ck_recurring_amount_positive", "recurring_transactions", type_="check")
    op.drop_constraint("ck_transactions_amount_positive", "transactions", type_="check")
