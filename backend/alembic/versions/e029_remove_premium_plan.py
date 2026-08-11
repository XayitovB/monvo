"""Remove duplicate Premium tariff and billing plan (999 000 sum).

Manually created via admin UI, duplicates Enterprise (990 000 sum).
Deleted from both billing_plans and tariffs tables.

Revision ID: e029_remove_premium_plan
Revises: e028_seed_tariffs
Create Date: 2026-05-18
"""
from alembic import op


revision = "e029_remove_premium_plan"
down_revision = "e028_seed_tariffs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM billing_plans
         WHERE (name IN ('Премиум', 'Premium') OR key = 'premium')
           AND price_monthly = 999000
        """
    )
    op.execute(
        """
        DELETE FROM tariffs
         WHERE (title_ru IN ('Премиум', 'Premium') OR title_uz IN ('Premиum', 'Premium', 'Премиум'))
            OR (name IN ('premium', 'Premium', 'Премиум') AND monthly_price = 999000)
        """
    )


def downgrade() -> None:
    pass
