"""auth throttle fix round 1

Revision ID: 764bc1132df0
Revises: 1c1a72a15b9e
Create Date: 2026-08-16 20:11:35.779938

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '764bc1132df0'
down_revision: Union[str, None] = '1c1a72a15b9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fix round 1 (issue #22 review): a checagem de duplicidade em
    # /auth/register e /auth/me era sensível a caixa, permitindo criar uma
    # conta-sombra ("Joao@x.com" ao lado de "joao@x.com" já existente). Login
    # com sucesso na conta-sombra resetava o balde de throttle da vítima
    # (a chave HMAC do throttle já normaliza a caixa do email, então as duas
    # contas caem na MESMA chave). A correção em app/routers/auth.py passa a
    # comparar por func.lower(User.email); este índice único funcional aplica
    # o mesmo invariante no banco, fechando a corrida entre o SELECT de
    # duplicidade e o INSERT/UPDATE (ver o catch de IntegrityError no router).
    #
    # PRÉ-VOO OBRIGATÓRIO: se já existem duas contas reais com o mesmo email
    # em caixas diferentes, o índice único não pode ser criado — e pior,
    # qualquer SELECT por func.lower(email) (login) passaria a levantar
    # MultipleResultsFound em vez de autenticar. Abortamos com uma mensagem
    # clara em vez de tentar mesclar contas sozinhos: qual conta fica (dados
    # financeiros, wallets, transações) é decisão do dono, não do script de
    # migration. Rodar esta consulta a mão primeiro se o abort dispersar:
    #   SELECT lower(email), array_agg(id) FROM users
    #   GROUP BY lower(email) HAVING count(*) > 1;
    conn = op.get_bind()
    duplicates = conn.execute(sa.text(
        "SELECT lower(email) AS email_lower, count(*) AS n "
        "FROM users GROUP BY lower(email) HAVING count(*) > 1"
    )).fetchall()
    if duplicates:
        listed = ", ".join(f"{row.email_lower} ({row.n}x)" for row in duplicates)
        raise RuntimeError(
            "Migration 764bc1132df0 abortada: existem contas com o mesmo "
            f"email em caixas diferentes: {listed}. Resolva manualmente qual "
            "conta fica (não é seguro mesclar automaticamente) antes de "
            "rodar esta migration de novo."
        )

    op.create_index('ix_users_email_lower', 'users', [sa.text('lower(email)')], unique=True)

    # Índice em last_failure_at: _purge_expired (throttle_service.py) roda um
    # DELETE WHERE last_failure_at < cutoff em TODA falha de login. Sem
    # índice, cada falha varre a tabela login_throttles inteira — o mecanismo
    # de defesa amplificando o próprio ataque em volume.
    op.create_index(
        op.f('ix_login_throttles_last_failure_at'),
        'login_throttles', ['last_failure_at'], unique=False,
    )

    # NOTA: o autogenerate também detectou as duas mudanças de schema já
    # conhecidas e deliberadamente fora de escopo (server_default de
    # recurring_transactions.active e a unicidade do índice de
    # refresh_tokens.token_hash) — ver a mesma nota na migration anterior
    # (1c1a72a15b9e). Seguem de fora daqui também.


def downgrade() -> None:
    op.drop_index(op.f('ix_login_throttles_last_failure_at'), table_name='login_throttles')
    op.drop_index('ix_users_email_lower', table_name='users')
