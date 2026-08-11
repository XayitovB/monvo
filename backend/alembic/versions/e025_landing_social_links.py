"""landing_social_links jadvali

Revision ID: e025_landing_social_links
Revises: e024_merchant_webhooks
Create Date: 2026-05-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e025_landing_social_links"
down_revision = "e024_merchant_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landing_social_links",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("platform", sa.String(30), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_landing_social_platform", "landing_social_links", ["platform"])


def downgrade() -> None:
    op.drop_table("landing_social_links")
