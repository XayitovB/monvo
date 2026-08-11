"""merchant_webhooks va webhook_deliveries jadvallari

Revision ID: e024_merchant_webhooks
Revises: e023_alipos_toggle
Create Date: 2026-05-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e024_merchant_webhooks"
down_revision = "e023_alipos_toggle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "merchant_webhooks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer, sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("secret", sa.String(100), nullable=False),
        sa.Column("description", sa.String(200), server_default="", nullable=False),
        sa.Column("events", sa.JSON, server_default='["*"]', nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_http_status", sa.Integer, nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("success_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("fail_count", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index("ix_merchant_webhooks_merchant", "merchant_webhooks", ["merchant_id"])

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("webhook_id", sa.Integer, sa.ForeignKey("merchant_webhooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("merchant_id", sa.Integer, nullable=False),
        sa.Column("event", sa.String(60), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("delivery_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("attempt", sa.Integer, server_default="0", nullable=False),
        sa.Column("http_status", sa.Integer, nullable=True),
        sa.Column("response_body", sa.String(500), nullable=True),
        sa.Column("error", sa.String(300), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_webhook_deliveries_webhook", "webhook_deliveries", ["webhook_id"])
    op.create_index("ix_webhook_deliveries_status_retry", "webhook_deliveries", ["status", "next_retry_at"])
    op.create_index("ix_webhook_deliveries_merchant", "webhook_deliveries", ["merchant_id"])


def downgrade() -> None:
    op.drop_table("webhook_deliveries")
    op.drop_table("merchant_webhooks")
