"""add recurring_transactions

Revision ID: 988428b2c26c
Revises: fa6026ea51ce
Create Date: 2026-06-23 21:51:59.943268

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '988428b2c26c'
down_revision: Union[str, None] = 'fa6026ea51ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the new enum type via raw SQL (avoids SQLAlchemy before_create event
    # re-creating the already-existing transactiontype enum).
    op.execute("CREATE TYPE recurrencefrequency AS ENUM ('WEEKLY', 'MONTHLY')")

    op.execute("""
        CREATE TABLE recurring_transactions (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            wallet_id UUID NOT NULL,
            type transactiontype NOT NULL,
            amount NUMERIC(15, 2) NOT NULL,
            category VARCHAR(100) NOT NULL,
            description VARCHAR(500),
            frequency recurrencefrequency NOT NULL,
            day_of_month INTEGER,
            weekday INTEGER,
            next_run_date TIMESTAMPTZ NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT fk_recurring_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_recurring_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE recurring_transactions")
    op.execute("DROP TYPE IF EXISTS recurrencefrequency")
