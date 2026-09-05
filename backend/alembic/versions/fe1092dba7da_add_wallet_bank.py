"""add wallet bank

Issue #34. PURAMENTE ADITIVA: coluna nullable, sem backfill. NULO significa
"sem banco definido" e e o estado de toda carteira que ja existe, entao o front
cai no comportamento antigo (inicial do nome) sem uma linha de UPDATE.

Guarda o SLUG, nao o nome do banco. O catalogo (rotulo, marca de duas letras)
vive no frontend, porque e apresentacao: manter a lista aqui exigiria deploy do
backend so para acrescentar um banco.

Revision ID: fe1092dba7da
Revises: d02a76d9af21
Create Date: 2026-09-05 21:58:20.762230

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fe1092dba7da'
down_revision: Union[str, None] = 'd02a76d9af21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('wallets', sa.Column('bank', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('wallets', 'bank')
