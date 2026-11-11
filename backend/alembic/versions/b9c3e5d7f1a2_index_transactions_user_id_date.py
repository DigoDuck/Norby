"""index (user_id, date) on transactions

Toda consulta do dashboard (resumo, últimas transações, os 7 meses do Ritmo e o
resumo da IA) filtra transactions por user_id e, quase sempre, por intervalo de
date. Sem índice em user_id, cada uma varre a tabela inteira: medido em 1,5M
linhas sintéticas, ~40 ms por consulta contra <3 ms com este índice. O composto
também atende filtro só por user_id (prefixo).

CONCURRENTLY pelo mesmo motivo do 64a95fc17195: não trava escrita, mas não roda
em transação. Se falhar no meio, o índice fica INVALID: DROP INDEX e rodar de novo.

Revision ID: b9c3e5d7f1a2
Revises: a7fd7b3a528d
Create Date: 2026-11-11 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b9c3e5d7f1a2'
down_revision: Union[str, None] = 'a7fd7b3a528d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_transactions_user_id_date", "transactions", ["user_id", "date"],
            postgresql_concurrently=True, if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_transactions_user_id_date", table_name="transactions",
            postgresql_concurrently=True, if_exists=True,
        )
