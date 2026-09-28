"""add wallet kind

Aditiva: toda carteira existente vira ACCOUNT pelo server_default, sem UPDATE.
O tipo é só apresentação; a regra de saldo não muda.

Revision ID: c3a9e1f07b24
Revises: b7d2e9f4a1c3
Create Date: 2026-09-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3a9e1f07b24'
down_revision: Union[str, None] = 'b7d2e9f4a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

walletkind = sa.Enum("ACCOUNT", "CREDIT_CARD", name="walletkind")


def upgrade() -> None:
    # add_column não cria o tipo sozinho no Postgres (create_table cria).
    walletkind.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "wallets",
        sa.Column("kind", walletkind, nullable=False, server_default="ACCOUNT"),
    )


def downgrade() -> None:
    op.drop_column("wallets", "kind")
    walletkind.drop(op.get_bind(), checkfirst=True)
