"""Update Pro plan price 499,999 -> 490,000.

Revision ID: e027_pro_price_490k
Revises: e026_update_billing_plan_prices
Create Date: 2026-05-15
"""
from alembic import op


revision = "e027_pro_price_490k"
down_revision = "e026_update_billing_plan_prices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 490000,
               price_yearly  = 4900000
         WHERE key = 'pro'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 499999,
               price_yearly  = 4999990
         WHERE key = 'pro'
        """
    )
