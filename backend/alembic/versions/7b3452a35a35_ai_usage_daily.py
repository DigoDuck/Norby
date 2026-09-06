"""ai_usage_daily

Issue #21 (ADR 0003). Aditiva, nada existente é tocado.

Uma linha por (usuário, dia da cota) com dois contadores: tokens reais lidos
do `usage_metadata` do Gemini e número de chamadas. `day` é o dia em UTC-8
(`QUOTA_TZ` em `ai_service.py`), o dia em que o Google zera o RPD do projeto,
não o dia UTC nem o de Brasília. Sem purga de propósito: uma linha por
usuário por dia não pesa, e o histórico é o instrumento que calibra os tetos
(o número de hoje é estimativa; o p99 real, depois de um mês, é medida). Some
com o usuário pelo `ON DELETE CASCADE`. Não entra no export da LGPD:
contadores, não conteúdo.

Revision ID: 7b3452a35a35
Revises: ac5c445ac949
Create Date: 2026-09-06 15:06:11.852539

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b3452a35a35'
down_revision: Union[str, None] = 'ac5c445ac949'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_usage_daily',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('tokens', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('calls', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'day'),
    )


def downgrade() -> None:
    op.drop_table('ai_usage_daily')
