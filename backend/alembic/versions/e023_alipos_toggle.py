"""AppSettings.pos_alipos_enabled — ALIPOS master toggle.

Revision ID: e023_alipos_toggle
Revises: e022_api_token_sec
Create Date: 2026-05-07
"""
from alembic import op


revision = "e023_alipos_toggle"
down_revision = "e022_api_token_sec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "pos_alipos_enabled BOOLEAN NOT NULL DEFAULT true"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_alipos_enabled")
