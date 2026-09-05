"""password reset tokens

Issue #36. Tabela nova, nada existente e tocado.

Guarda o SHA256 do token, nunca o token cru — ele viaja por e-mail e o banco
nao precisa dele para validar. Repare que o autogenerate emitiu UM indice
unico em `token_hash`, e nao o par constraint+indice que `refresh_tokens`
carregava desde 2026: e o conserto do #105 valendo no primeiro uso, porque
agora o modelo e a migration concordam sobre o que `unique=True, index=True`
significa.

Revision ID: 205f60ec5dbf
Revises: fe1092dba7da
Create Date: 2026-09-05 22:14:01.580751

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '205f60ec5dbf'
down_revision: Union[str, None] = 'fe1092dba7da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_password_reset_tokens_token_hash'), 'password_reset_tokens', ['token_hash'], unique=True)
    op.create_index(op.f('ix_password_reset_tokens_user_id'), 'password_reset_tokens', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_password_reset_tokens_user_id'), table_name='password_reset_tokens')
    op.drop_index(op.f('ix_password_reset_tokens_token_hash'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
