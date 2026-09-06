"""refresh token revoked_at for the reuse grace

Issue #130. Aditiva, nada existente é tocado.

Hoje `revoked` (booleano) marca um refresh como morto, mas não guarda QUANDO.
A janela de tolerância a reuso (`ROTATION_REUSE_GRACE`, 30s) precisa desse
instante para distinguir resposta perdida de roubo de token. Linhas já
revogadas antes desta migration ficam com `revoked_at` NULL, e a tolerância
trata NULL como "fora da janela" — comportamento antigo preservado para o
histórico.

Revision ID: ac5c445ac949
Revises: 205f60ec5dbf
Create Date: 2026-09-06 13:53:38.871760

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac5c445ac949'
down_revision: Union[str, None] = '205f60ec5dbf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('refresh_tokens', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('refresh_tokens', 'revoked_at')
