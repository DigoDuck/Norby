"""add login_throttles

Revision ID: 1c1a72a15b9e
Revises: b2c3d4e5f6a7
Create Date: 2026-08-16 17:05:28.720956

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c1a72a15b9e'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Issue #22: atraso progressivo por conta, chaveado por HMAC do email (o
    # email cru nunca é gravado). Sem FK pra users — a chave é derivada do
    # email digitado, que pode nem corresponder a uma conta existente (é
    # assim que o contador incrementa igual para email real e inexistente).
    op.create_table(
        'login_throttles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('failure_count', sa.Integer(), nullable=False),
        sa.Column('last_failure_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_login_throttles_key_hash'), 'login_throttles', ['key_hash'], unique=True)
    # NOTA: o autogenerate também detectou duas mudanças de schema que já
    # existiam em produção antes desta branch (server_default de
    # recurring_transactions.active e a unicidade do índice de
    # refresh_tokens.token_hash) — deliberadamente deixadas de fora daqui por
    # não fazerem parte do escopo desta migration (rate limit, issue #22).


def downgrade() -> None:
    op.drop_index(op.f('ix_login_throttles_key_hash'), table_name='login_throttles')
    op.drop_table('login_throttles')
