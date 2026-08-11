"""User language: add language column to users

Revision ID: e004_user_language
Revises: e003_user_roles
Create Date: 2026-04-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e004_user_language"
down_revision = "e003_user_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(5), server_default="uz", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "language")
