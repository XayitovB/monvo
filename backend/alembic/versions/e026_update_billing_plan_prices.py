"""Update billing plan prices: Standard 149k->239k, Pro 349k->499,999.

Enterprise (990,000) and Free (0) remain unchanged. Existing rows seeded by
e020 are bumped to new pricing; fresh deploys already get the new values
from the updated seed.

Revision ID: e026_update_billing_plan_prices
Revises: e025_landing_social_links
Create Date: 2026-05-15
"""
from alembic import op


revision = "e026_update_billing_plan_prices"
down_revision = "e025_landing_social_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 239000,
               price_yearly  = 2390000
         WHERE key = 'standard'
        """
    )
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 499999,
               price_yearly  = 4999990
         WHERE key = 'pro'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 149000,
               price_yearly  = 1490000
         WHERE key = 'standard'
        """
    )
    op.execute(
        """
        UPDATE billing_plans
           SET price_monthly = 349000,
               price_yearly  = 3490000
         WHERE key = 'pro'
        """
    )
