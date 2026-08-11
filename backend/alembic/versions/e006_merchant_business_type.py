"""Merchant business_type column

Revision ID: e006_merchant_business_type
Revises: e005_user_notifications
Create Date: 2026-04-21 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e006_merchant_business_type"
down_revision = "e005_user_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "merchants",
        sa.Column("business_type", sa.String(40), server_default="other", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("merchants", "business_type")
