"""add privacy consent timestamp

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-21 00:00:00.000000

O aceite da política era validado só no Zod do frontend e não chegava ao
backend. Sem timestamp persistido não há como demonstrar o consentimento.

Coluna nullable de propósito: usuários criados antes desta migration não
aceitaram nada por este fluxo, e inventar uma data para eles seria falsear o
registro. NULL significa "aceite não registrado".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "privacy_accepted_at")
