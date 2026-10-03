"""add import batches

Idempotência da confirmação de importação. Tabela nova e aditiva.

Revision ID: e4b7c2a91f06
Revises: d8f2b6a41c95
Create Date: 2026-10-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e4b7c2a91f06'
down_revision: Union[str, None] = 'd8f2b6a41c95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("idempotency_key", sa.UUID(), nullable=False),
        sa.Column("transactions", sa.Integer(), nullable=False),
        sa.Column("transfers", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "idempotency_key"),
    )


def downgrade() -> None:
    op.drop_table("import_batches")
