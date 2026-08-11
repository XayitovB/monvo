"""User roles: add role + merchant_account_id to users

Revision ID: e003_user_roles
Revises: e001_phone_auth
Create Date: 2026-04-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e003_user_roles"
down_revision = "e001_phone_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(20), server_default="user", nullable=False))
    op.add_column("users", sa.Column("merchant_account_id", sa.Integer,
        sa.ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_user_role", "users", ["role"])


def downgrade() -> None:
    op.drop_index("ix_user_role", table_name="users")
    op.drop_column("users", "merchant_account_id")
    op.drop_column("users", "role")
