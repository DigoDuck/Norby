"""import batch wallet

Guarda em que carteira o lote entrou, para o retry com outra carteira
escolhida nomear a certa (issue #217). Coluna nova, nullable, sem FK.

Revision ID: a7fd7b3a528d
Revises: 64a95fc17195
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7fd7b3a528d'
down_revision: Union[str, None] = '64a95fc17195'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("import_batches", sa.Column("wallet_id", sa.UUID(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_batches", "wallet_id")
