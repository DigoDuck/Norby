"""add users.token_epoch

Revision ID: 727e35481441
Revises: 22b6c15c4699
Create Date: 2026-09-22 22:01:01.094144

Epoch de credencial (issue #156). Sobe em reset_password e na troca de
e-mail; get_current_user rejeita todo access token emitido com um epoch mais
antigo que o da linha. `server_default="0"` para o backfill de quem já tem
conta: ninguém perde sessão só por a coluna ter nascido.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '727e35481441'
down_revision: Union[str, None] = '22b6c15c4699'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_epoch",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_epoch")
