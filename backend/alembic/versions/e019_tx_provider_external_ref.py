"""Transaction.provider + external_ref for POS webhook idempotency.

Revision ID: e019_tx_provider_external_ref
Revises: e018_pos_poster_moysklad
Create Date: 2026-05-03
"""
from alembic import op


revision = "e019_tx_provider_external_ref"
down_revision = "e018_pos_poster_moysklad"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    _exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider VARCHAR(40)")
    _exec("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_ref VARCHAR(120)")
    # Partial unique index: only enforced when both fields are non-NULL
    # (regular cashier-scan transactions have provider=NULL and must not collide).
    _exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_provider_external "
        "ON transactions(provider, external_ref) "
        "WHERE provider IS NOT NULL AND external_ref IS NOT NULL"
    )


def downgrade() -> None:
    _exec("DROP INDEX IF EXISTS uq_tx_provider_external")
    _exec("ALTER TABLE transactions DROP COLUMN IF EXISTS external_ref")
    _exec("ALTER TABLE transactions DROP COLUMN IF EXISTS provider")
