"""Seed default billing plans (Free / Standard / Pro / Enterprise).

Without these the admin "Access kengaytirish → Tarif" dropdown shows only
"— o'zgarmasin —". Inserted with ON CONFLICT DO NOTHING so a manually
populated table is left untouched.

Revision ID: e020_seed_billing_plans
Revises: e019_tx_provider_external_ref
Create Date: 2026-05-04
"""
from alembic import op


revision = "e020_seed_billing_plans"
down_revision = "e019_tx_provider_external_ref"
branch_labels = None
depends_on = None


PLANS = [
    {
        "key": "free",
        "name": "Free",
        "description": "Boshlovchi bizneslar uchun",
        "price_monthly": 0,
        "price_yearly": 0,
        "max_cards": 100,
        "max_rewards": 5,
        "max_branches": 1,
        "features": '{"push": false, "sms": false, "analytics": false, "pos": false}',
        "sort_order": 10,
    },
    {
        "key": "standard",
        "name": "Standard",
        "description": "Kichik biznes uchun",
        "price_monthly": 239000,
        "price_yearly": 2390000,
        "max_cards": 1000,
        "max_rewards": 25,
        "max_branches": 3,
        "features": '{"push": true, "sms": false, "analytics": true, "pos": false}',
        "sort_order": 20,
    },
    {
        "key": "pro",
        "name": "Pro",
        "description": "O'rta biznes uchun — POS integratsiya bilan",
        "price_monthly": 490000,
        "price_yearly": 4900000,
        "max_cards": 10000,
        "max_rewards": -1,
        "max_branches": 10,
        "features": '{"push": true, "sms": true, "analytics": true, "pos": true}',
        "sort_order": 30,
    },
    {
        "key": "enterprise",
        "name": "Enterprise",
        "description": "Yirik tarmoqlar uchun — cheksiz limit",
        "price_monthly": 990000,
        "price_yearly": 9900000,
        "max_cards": -1,
        "max_rewards": -1,
        "max_branches": -1,
        "features": '{"push": true, "sms": true, "analytics": true, "pos": true, "priority_support": true}',
        "sort_order": 40,
    },
]


def upgrade() -> None:
    for p in PLANS:
        op.execute(
            f"""
            INSERT INTO billing_plans
              (key, name, description, price_monthly, price_yearly,
               max_cards, max_rewards, max_branches, features,
               sort_order, is_active, created_at)
            VALUES (
              '{p["key"]}',
              '{p["name"]}',
              '{p["description"].replace("'", "''")}',
              {p["price_monthly"]},
              {p["price_yearly"]},
              {p["max_cards"]},
              {p["max_rewards"]},
              {p["max_branches"]},
              '{p["features"]}'::jsonb,
              {p["sort_order"]},
              TRUE,
              NOW()
            )
            ON CONFLICT (key) DO NOTHING
            """
        )


def downgrade() -> None:
    keys = ", ".join(f"'{p['key']}'" for p in PLANS)
    op.execute(f"DELETE FROM billing_plans WHERE key IN ({keys})")
