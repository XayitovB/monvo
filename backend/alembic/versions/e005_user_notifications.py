"""User notifications table

Revision ID: e005_user_notifications
Revises: e004_user_language
Create Date: 2026-04-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e005_user_notifications"
down_revision = "e004_user_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("icon", sa.String(50), server_default="notifications"),
        sa.Column("is_read", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notif_user_created", "user_notifications", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notif_user_created", table_name="user_notifications")
    op.drop_table("user_notifications")
