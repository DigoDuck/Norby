"""index wallet_id on transactions and recurring_transactions

Excluir uma carteira trava e apaga as linhas por wallet_id; sem índice, cada
exclusão varre as duas tabelas inteiras (issue #218). CONCURRENTLY não trava
escritas durante a criação, mas não roda dentro de transação: por isso o
autocommit_block. Se a criação falhar no meio, o Postgres deixa um índice
INVALID; o IF NOT EXISTS não o conserta, é preciso DROP INDEX e rodar de novo.

Revision ID: 64a95fc17195
Revises: e4b7c2a91f06
Create Date: 2026-10-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '64a95fc17195'
down_revision: Union[str, None] = 'e4b7c2a91f06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICES = (
    ("ix_transactions_wallet_id", "transactions"),
    ("ix_recurring_transactions_wallet_id", "recurring_transactions"),
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for nome, tabela in INDICES:
            op.create_index(
                nome, tabela, ["wallet_id"], postgresql_concurrently=True, if_not_exists=True
            )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for nome, tabela in INDICES:
            op.drop_index(nome, table_name=tabela, postgresql_concurrently=True, if_exists=True)
