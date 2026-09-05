"""add user photo

Revision ID: a1f4c9d2e7b3
Revises: 154dd832e2d8
Create Date: 2026-09-04

Foto de perfil (issue #35). Duas colunas NULÁVEIS, sem backfill: quem já tem
conta simplesmente segue sem foto, e a tela cai nas iniciais.
"""

from alembic import op
import sqlalchemy as sa

revision = "a1f4c9d2e7b3"
down_revision = "154dd832e2d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("photo", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users",
        sa.Column("photo_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # Destrutivo por natureza: descer apaga as fotos. É o inverso exato do
    # upgrade, e não há como preservar um dado que a coluna só guarda aqui.
    op.drop_column("users", "photo_updated_at")
    op.drop_column("users", "photo")
