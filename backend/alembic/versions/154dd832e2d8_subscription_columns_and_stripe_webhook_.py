"""subscription columns and stripe webhook events

Revision ID: 154dd832e2d8
Revises: 764bc1132df0
Create Date: 2026-08-25 19:34:37.418453

Issue #44, implementando o ADR 0001 (docs/adr/0001-modelo-de-assinatura.md).

PURAMENTE ADITIVA, sem backfill: toda coluna nova nasce NULL nas linhas
existentes, e NULL em `premium_until` significa "nunca assinou" enquanto NULL em
`ai_trial_ends_at` significa "sem trial". É assim que a decisão travada do #15 —
usuário pré-v2 vira free, sem grandfathering nem trial retroativo — sai de graça,
sem uma linha de UPDATE.

DUAS MUDANÇAS DO AUTOGENERATE FORAM REMOVIDAS À MÃO (mesmo drift pré-existente
que as migrations 1c1a72a15b9e e 764bc1132df0 já haviam recusado):

  1. `recurring_transactions.active`: o autogenerate queria derrubar o
     server_default. Fora de escopo e com efeito destrutivo — INSERT que hoje
     omite a coluna passaria a falhar.
  2. `refresh_tokens.token_hash`: queria trocar a unique constraint por índice
     único. Fora de escopo, e mexer em índice de tabela de sessão numa migration
     de billing é acoplar dois riscos sem motivo.

Uma TERCEIRA correção, esta de bug do próprio autogenerate: ele emitiu
`create_unique_constraint(None, ...)` no upgrade e `drop_constraint(None, ...)`
no downgrade. Com nome None o Postgres batiza sozinho, e o downgrade
quebraria na hora de derrubar uma constraint chamada "None". Nomeada
explicitamente abaixo.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '154dd832e2d8'
down_revision: Union[str, None] = '764bc1132df0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UQ_STRIPE_CUSTOMER = "uq_users_stripe_customer_id"


def upgrade() -> None:
    # Projeção dos campos que o handler do webhook usa — nunca o payload cru.
    # O `checkout.session.completed` traz `customer_details.email`, e guardar o
    # evento inteiro colocaria PII fora do alcance do delete_account.
    # A idempotência mora na PK: event_id repetido conflita e o handler (#45)
    # responde 200 sem reprocessar.
    op.create_table(
        'stripe_webhook_events',
        sa.Column('event_id', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('stripe_created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('customer_id', sa.String(length=255), nullable=True),
        sa.Column('subscription_id', sa.String(length=255), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean(), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('event_id'),
    )
    op.create_index(
        op.f('ix_stripe_webhook_events_customer_id'),
        'stripe_webhook_events', ['customer_id'], unique=False,
    )

    # premium_until é o portão e a única coluna que a autorização lê; indexada
    # porque a reconciliação preguiçosa (#48) vai filtrar por ela.
    op.add_column('users', sa.Column('premium_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('ai_trial_ends_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('stripe_customer_id', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('subscription_status', sa.String(length=32), nullable=True))
    # server_default false é o que permite adicionar coluna NOT NULL numa tabela
    # que já tem linhas: sem ele o ALTER falha em produção, não aqui.
    op.add_column(
        'users',
        sa.Column('cancel_at_period_end', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.add_column('users', sa.Column('stripe_event_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_users_premium_until'), 'users', ['premium_until'], unique=False)
    op.create_unique_constraint(UQ_STRIPE_CUSTOMER, 'users', ['stripe_customer_id'])


def downgrade() -> None:
    op.drop_constraint(UQ_STRIPE_CUSTOMER, 'users', type_='unique')
    op.drop_index(op.f('ix_users_premium_until'), table_name='users')
    op.drop_column('users', 'stripe_event_at')
    op.drop_column('users', 'cancel_at_period_end')
    op.drop_column('users', 'subscription_status')
    op.drop_column('users', 'stripe_subscription_id')
    op.drop_column('users', 'stripe_customer_id')
    op.drop_column('users', 'ai_trial_ends_at')
    op.drop_column('users', 'premium_until')
    op.drop_index(op.f('ix_stripe_webhook_events_customer_id'), table_name='stripe_webhook_events')
    op.drop_table('stripe_webhook_events')
