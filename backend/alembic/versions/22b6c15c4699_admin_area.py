"""admin_area

Issue #23 (ADR 0004). Aditiva, nada existente é tocado.

`users.is_admin`: coluna, não lista de e-mails em config — a coluna morre com
a linha, e um e-mail recadastrado depois de excluir a conta não herda nada.
Nenhum endpoint escreve nela; o primeiro e único admin nasce por UPDATE manual
no console do banco (ver AGENTS.md).

`admin_actions`: auditoria só-insert das três ações do admin. `admin_id` e
`target_user_id` são UUIDs SEM chave estrangeira, de propósito — excluir a
conta é uma das ações auditadas, e uma FK com cascade apagaria junto o
registro de que ela foi excluída. `target_email` é o snapshot que identifica
o alvo depois que a linha dele some.

Revision ID: 22b6c15c4699
Revises: 7b3452a35a35
Create Date: 2026-09-06 20:59:07.311127

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '22b6c15c4699'
down_revision: Union[str, None] = '7b3452a35a35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.create_table('admin_actions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('admin_id', sa.UUID(), nullable=False),
    sa.Column('action', sa.String(length=32), nullable=False),
    sa.Column('target_user_id', sa.UUID(), nullable=False),
    sa.Column('target_email', sa.String(length=255), nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('detail', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('admin_actions')
    op.drop_column('users', 'is_admin')
