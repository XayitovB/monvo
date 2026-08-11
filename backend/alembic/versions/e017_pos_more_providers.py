"""POS integrations: add YCLIENTS, r_keeper, 1C master toggles.

Revision ID: e017_pos_more_providers
Revises: e016_pos_integrations
Create Date: 2026-05-03
"""
from alembic import op


revision = "e017_pos_more_providers"
down_revision = "e016_pos_integrations"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_yclients_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_rkeeper_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_onec_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_yclients_enabled")
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_rkeeper_enabled")
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_onec_enabled")
