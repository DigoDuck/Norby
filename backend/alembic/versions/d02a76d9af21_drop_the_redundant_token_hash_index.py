"""drop the redundant token_hash index

Revision ID: d02a76d9af21
Revises: a1f4c9d2e7b3
Create Date: 2026-09-05 13:31:03.798757

Fecha o drift que as migrations 1c1a72a15b9e, 764bc1132df0 e 154dd832e2d8
recusaram, cada uma corretamente, por estar fora do escopo delas. Aqui ele É o
escopo, e ficar sem essa migration custa caro: todo autogenerate futuro volta a
emitir estas operações e alguém precisa apagá-las à mão de novo.

O que o banco tinha em `refresh_tokens.token_hash`:

    ix_refresh_tokens_token_hash        btree (token_hash)
    refresh_tokens_token_hash_key       UNIQUE CONSTRAINT, btree (token_hash)

DOIS B-trees na mesma coluna. A migration c4d5e6f7a8b9 criou os dois porque o
modelo declara `unique=True, index=True`, e o autogenerate da época emitiu a
constraint e o índice separadamente em vez do índice único que essa combinação
significa no SQLAlchemy. O índice não-único nunca serviu para nada: qualquer
consulta que ele atenderia já é atendida pelo índice da constraint.

`refresh_tokens` recebe INSERT em todo login E em toda rotação de refresh, então
o índice sobrando é escrita desperdiçada no caminho mais quente da autenticação.

SEM PERDA DE DADOS. As três operações rodam na mesma transação, e DDL em
Postgres pega ACCESS EXCLUSIVE na tabela até o commit — nenhuma outra sessão
consegue inserir enquanto a unicidade está momentaneamente sem quem a imponha.
Nenhum código referencia o nome `refresh_tokens_token_hash_key` (conferido), e
o downgrade recria o estado anterior exatamente, os dois índices inclusive.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd02a76d9af21'
down_revision: Union[str, None] = 'a1f4c9d2e7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(op.f('refresh_tokens_token_hash_key'), 'refresh_tokens', type_='unique')
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=False)
    op.create_unique_constraint(op.f('refresh_tokens_token_hash_key'), 'refresh_tokens', ['token_hash'], postgresql_nulls_not_distinct=False)
