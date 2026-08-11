"""POS integrations: master toggles + per-merchant connections.

Revision ID: e016_pos_integrations
Revises: e015_branch_photos
Create Date: 2026-05-03
"""
from alembic import op


revision = "e016_pos_integrations"
down_revision = "e015_branch_photos"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    # Master toggles on the existing app_settings row
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_billz_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_iiko_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )

    # Per-merchant POS connections
    _exec(
        """
        CREATE TABLE IF NOT EXISTS pos_integrations (
            id            SERIAL PRIMARY KEY,
            merchant_id   INTEGER NOT NULL
                          REFERENCES merchants(id) ON DELETE CASCADE,
            provider      VARCHAR(40) NOT NULL,
            credentials   JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            last_sync_at  TIMESTAMPTZ,
            last_error    TEXT DEFAULT '',
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_pos_merchant_provider
                UNIQUE (merchant_id, provider)
        )
        """
    )
    _exec(
        "CREATE INDEX IF NOT EXISTS ix_pos_integrations_merchant "
        "ON pos_integrations(merchant_id)"
    )
    _exec(
        "CREATE INDEX IF NOT EXISTS ix_pos_integrations_provider "
        "ON pos_integrations(provider)"
    )


def downgrade() -> None:
    _exec("DROP TABLE IF EXISTS pos_integrations")
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_billz_enabled")
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_iiko_enabled")
