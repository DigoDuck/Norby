"""add goals

Revision ID: e7a8b2c318a8
Revises: 988428b2c26c
Create Date: 2026-06-23 22:49:59.521406

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a8b2c318a8'
down_revision: Union[str, None] = '988428b2c26c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("type", sa.Enum("SAVINGS", "BUDGET", name="goaltype"), nullable=False),
        sa.Column("target_amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("current_amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("goals")
    sa.Enum(name="goaltype").drop(op.get_bind(), checkfirst=True)
