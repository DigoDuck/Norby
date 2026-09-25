"""refresh session: remember flag and absolute cap

Revision ID: b7d2e9f4a1c3
Revises: 727e35481441
Create Date: 2026-09-25 12:00:00

Issue #175. Aditiva, nada existente é apagado.

- `remember`: server_default true, então toda sessão viva no deploy continua
  sendo o que era (7 dias renovando). Ninguém é deslogado pela migration.
- `session_expires_at`: teto absoluto da sessão. Nasce anulável só para o
  backfill: as linhas existentes ganham deploy + 90 dias, o teto de uma sessão
  lembrada — sem isso, as sessões de antes do #175 continuariam sem teto
  nenhum. Depois do backfill vira NOT NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e9f4a1c3'
down_revision: Union[str, None] = '727e35481441'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("remember", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "refresh_tokens",
        sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE refresh_tokens SET session_expires_at = now() + interval '90 days'")
    op.alter_column("refresh_tokens", "session_expires_at", nullable=False)


def downgrade() -> None:
    op.drop_column("refresh_tokens", "session_expires_at")
    op.drop_column("refresh_tokens", "remember")
