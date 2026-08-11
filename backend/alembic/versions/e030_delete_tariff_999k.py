"""Delete any tariff with monthly_price = 999000 (duplicate Premium).

e029 may have missed it if the title didn't match exactly.
Price 999 000 is unique — no canonical tariff uses it.

Revision ID: e030_delete_tariff_999k
Revises: e029_remove_premium_plan
Create Date: 2026-05-18
"""
from alembic import op


revision = "e030_delete_tariff_999k"
down_revision = "e029_remove_premium_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM tariffs WHERE monthly_price = 999000")
    op.execute("DELETE FROM billing_plans WHERE price_monthly = 999000")


def downgrade() -> None:
    pass
