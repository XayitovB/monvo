"""Merchant API tokens — expiry + lockout columns.

Adds:
  - expires_at        — optional token expiry timestamp
  - failed_attempts   — bad-token counter for brute-force protection
  - locked_until      — soft lockout window after too many failures

Idempotent (IF NOT EXISTS).

Revision ID: e022_api_token_sec
Revises: e021_consolidate
Create Date: 2026-05-07
"""
from alembic import op


revision = "e022_api_token_sec"
down_revision = "e021_consolidate"
branch_labels = None
depends_on = None


_STATEMENTS = [
    "ALTER TABLE merchant_api_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
    "ALTER TABLE merchant_api_tokens ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE merchant_api_tokens ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
]


def upgrade() -> None:
    for stmt in _STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("ALTER TABLE merchant_api_tokens DROP COLUMN IF EXISTS expires_at")
    op.execute("ALTER TABLE merchant_api_tokens DROP COLUMN IF EXISTS failed_attempts")
    op.execute("ALTER TABLE merchant_api_tokens DROP COLUMN IF EXISTS locked_until")
