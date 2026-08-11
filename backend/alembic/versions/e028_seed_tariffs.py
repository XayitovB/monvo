"""Seed tariffs table: Start / Business / Enterprise.

Fills the `tariffs` table (created in e021_consolidate) with the three
canonical plans used by both the landing page and the merchant billing screen.
Also ensures has_pos_integration column exists and adds a unique index on name.

Revision ID: e028_seed_tariffs
Revises: e027_pro_price_490k
Create Date: 2026-05-17
"""
from alembic import op


revision = "e028_seed_tariffs"
down_revision = "e027_pro_price_490k"
branch_labels = None
depends_on = None


TARIFFS = [
    {
        "name":           "start",
        "title_uz":       "Start",
        "title_ru":       "Start",
        "description_uz": "Kichik biznes uchun — 1 filial, 500 mijozgacha",
        "description_ru": "Для малого бизнеса — 1 точка, до 500 клиентов",
        "monthly_price":  239000,
        "sort_order":     10,
        "is_recommended": False,
        "max_customers":      500,
        "max_branches":       1,
        "max_staff":          3,
        "max_rewards":        "NULL",
        "max_push_per_month": 1000,
        "has_tier":               False,
        "has_gamification":       False,
        "has_games":              False,
        "has_birthday_bonus":     False,
        "has_segments_advanced":  False,
        "has_card_design_custom": False,
        "has_scheduled_push":     False,
        "has_api_access":         False,
        "has_priority_support":   False,
        "has_pos_integration":    False,
    },
    {
        "name":           "business",
        "title_uz":       "Business",
        "title_ru":       "Business",
        "description_uz": "O'rta biznes uchun — to'liq funksional, 10 filialga qadar",
        "description_ru": "Для среднего бизнеса — полный функционал, до 10 точек",
        "monthly_price":  490000,
        "sort_order":     20,
        "is_recommended": True,
        "max_customers":      "NULL",
        "max_branches":       10,
        "max_staff":          25,
        "max_rewards":        "NULL",
        "max_push_per_month": 20000,
        "has_tier":               True,
        "has_gamification":       True,
        "has_games":              False,
        "has_birthday_bonus":     True,
        "has_segments_advanced":  True,
        "has_card_design_custom": True,
        "has_scheduled_push":     True,
        "has_api_access":         True,
        "has_priority_support":   False,
        "has_pos_integration":    True,
    },
    {
        "name":           "enterprise",
        "title_uz":       "Enterprise",
        "title_ru":       "Enterprise",
        "description_uz": "Yirik tarmoqlar uchun — cheksiz limitlar va shaxsiy menejer",
        "description_ru": "Для крупных сетей — безлимитно и персональный менеджер",
        "monthly_price":  990000,
        "sort_order":     30,
        "is_recommended": False,
        "max_customers":      "NULL",
        "max_branches":       "NULL",
        "max_staff":          "NULL",
        "max_rewards":        "NULL",
        "max_push_per_month": "NULL",
        "has_tier":               True,
        "has_gamification":       True,
        "has_games":              False,
        "has_birthday_bonus":     True,
        "has_segments_advanced":  True,
        "has_card_design_custom": True,
        "has_scheduled_push":     True,
        "has_api_access":         True,
        "has_priority_support":   True,
        "has_pos_integration":    True,
    },
]


def _b(v: bool) -> str:
    return "TRUE" if v else "FALSE"


def upgrade() -> None:
    # Ensure has_pos_integration column exists (may have been added by _ensure_tariff_tables)
    op.execute(
        "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS "
        "has_pos_integration BOOLEAN NOT NULL DEFAULT false"
    )
    # Unique index on name for idempotent runs
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tariffs_name ON tariffs (name)"
    )

    for t in TARIFFS:
        op.execute(
            f"""
            INSERT INTO tariffs (
                name, title_uz, title_ru,
                description_uz, description_ru,
                monthly_price, is_active, is_recommended, sort_order,
                max_customers, max_branches, max_staff,
                max_rewards, max_push_per_month,
                has_tier, has_gamification, has_games, has_birthday_bonus,
                has_segments_advanced, has_card_design_custom,
                has_scheduled_push, has_api_access,
                has_priority_support, has_pos_integration,
                extra_features, created_at, updated_at
            ) VALUES (
                '{t["name"]}',
                '{t["title_uz"]}',
                '{t["title_ru"]}',
                '{t["description_uz"].replace("'", "''")}',
                '{t["description_ru"].replace("'", "''")}',
                {t["monthly_price"]},
                TRUE,
                {_b(t["is_recommended"])},
                {t["sort_order"]},
                {t["max_customers"]},
                {t["max_branches"]},
                {t["max_staff"]},
                {t["max_rewards"]},
                {t["max_push_per_month"]},
                {_b(t["has_tier"])},
                {_b(t["has_gamification"])},
                {_b(t["has_games"])},
                {_b(t["has_birthday_bonus"])},
                {_b(t["has_segments_advanced"])},
                {_b(t["has_card_design_custom"])},
                {_b(t["has_scheduled_push"])},
                {_b(t["has_api_access"])},
                {_b(t["has_priority_support"])},
                {_b(t["has_pos_integration"])},
                '[]'::json,
                NOW(),
                NOW()
            )
            ON CONFLICT (name) DO UPDATE SET
                title_uz               = EXCLUDED.title_uz,
                title_ru               = EXCLUDED.title_ru,
                description_uz         = EXCLUDED.description_uz,
                description_ru         = EXCLUDED.description_ru,
                monthly_price          = EXCLUDED.monthly_price,
                is_recommended         = EXCLUDED.is_recommended,
                sort_order             = EXCLUDED.sort_order,
                max_customers          = EXCLUDED.max_customers,
                max_branches           = EXCLUDED.max_branches,
                max_staff              = EXCLUDED.max_staff,
                max_rewards            = EXCLUDED.max_rewards,
                max_push_per_month     = EXCLUDED.max_push_per_month,
                has_tier               = EXCLUDED.has_tier,
                has_gamification       = EXCLUDED.has_gamification,
                has_games              = EXCLUDED.has_games,
                has_birthday_bonus     = EXCLUDED.has_birthday_bonus,
                has_segments_advanced  = EXCLUDED.has_segments_advanced,
                has_card_design_custom = EXCLUDED.has_card_design_custom,
                has_scheduled_push     = EXCLUDED.has_scheduled_push,
                has_api_access         = EXCLUDED.has_api_access,
                has_priority_support   = EXCLUDED.has_priority_support,
                has_pos_integration    = EXCLUDED.has_pos_integration,
                updated_at             = NOW()
            """
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM tariffs WHERE name IN ('start', 'business', 'enterprise')"
    )
