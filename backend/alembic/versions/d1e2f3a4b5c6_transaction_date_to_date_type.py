"""transaction date to date type

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-06-29 00:00:00.000000

A data de uma transação é um DIA de calendário, não um instante. Ela estava
armazenada como timestamptz (UTC midnight), o que fazia o frontend exibir o dia
anterior em fusos negativos (UTC-3). Migramos a coluna para DATE.

A conversão usa `AT TIME ZONE 'UTC'` antes do cast para preservar o dia que o
usuário originalmente digitou (a meia-noite estava gravada em UTC). O downgrade
recompõe o timestamptz como meia-noite UTC desse mesmo dia.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "transactions",
        "date",
        type_=sa.Date(),
        postgresql_using="(date AT TIME ZONE 'UTC')::date",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "transactions",
        "date",
        type_=sa.DateTime(timezone=True),
        postgresql_using="(date::timestamp AT TIME ZONE 'UTC')",
        existing_nullable=False,
    )
