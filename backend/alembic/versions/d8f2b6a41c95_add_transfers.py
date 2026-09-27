"""add transfers

Transferência entre carteiras (pagar a fatura do cartão). Tabela nova e
aditiva; nada existente muda.

Revision ID: d8f2b6a41c95
Revises: c3a9e1f07b24
Create Date: 2026-09-27 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8f2b6a41c95'
down_revision: Union[str, None] = 'c3a9e1f07b24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transfers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("from_wallet_id", sa.UUID(), nullable=False),
        sa.Column("to_wallet_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_transfers_amount_positive"),
        sa.CheckConstraint("from_wallet_id <> to_wallet_id", name="ck_transfers_distinct_wallets"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_wallet_id"], ["wallets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_wallet_id"], ["wallets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfers_user_id", "transfers", ["user_id"])
    op.create_index("ix_transfers_from_wallet_id", "transfers", ["from_wallet_id"])
    op.create_index("ix_transfers_to_wallet_id", "transfers", ["to_wallet_id"])


def downgrade() -> None:
    op.drop_table("transfers")
