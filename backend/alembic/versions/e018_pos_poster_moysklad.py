"""POS integrations: add Poster + MoySklad master toggles.

Revision ID: e018_pos_poster_moysklad
Revises: e017_pos_more_providers
Create Date: 2026-05-03
"""
from alembic import op


revision = "e018_pos_poster_moysklad"
down_revision = "e017_pos_more_providers"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_poster_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )
    _exec(
        "ALTER TABLE app_settings "
        "ADD COLUMN IF NOT EXISTS pos_moysklad_enabled BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_poster_enabled")
    _exec("ALTER TABLE app_settings DROP COLUMN IF EXISTS pos_moysklad_enabled")
