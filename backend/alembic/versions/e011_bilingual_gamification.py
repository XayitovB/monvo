"""Add Russian translations for achievements and contests.

Adds title_ru/description_ru columns to achievements + contests, plus
prize_description_ru on contests. Backfills RU translations for the 15
default badges seeded in e010 so users with locale=ru immediately see
localized text. Idempotent (uses IF NOT EXISTS).

Revision ID: e011_bilingual_gamification
Revises: e010_gamification_tables
Create Date: 2026-04-26
"""
from alembic import op

revision = "e011_bilingual_gamification"
down_revision = "e010_gamification_tables"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    # ─── achievements: add bilingual columns ─────────────────────────────────
    _exec("ALTER TABLE achievements ADD COLUMN IF NOT EXISTS title_ru VARCHAR(150) DEFAULT ''")
    _exec("ALTER TABLE achievements ADD COLUMN IF NOT EXISTS description_ru TEXT DEFAULT ''")

    # ─── contests: add bilingual columns ─────────────────────────────────────
    _exec("ALTER TABLE contests ADD COLUMN IF NOT EXISTS title_ru VARCHAR(200) DEFAULT ''")
    _exec("ALTER TABLE contests ADD COLUMN IF NOT EXISTS description_ru TEXT DEFAULT ''")
    _exec("ALTER TABLE contests ADD COLUMN IF NOT EXISTS prize_description_ru TEXT DEFAULT ''")

    # ─── Seed RU translations for default badges (only if currently empty) ──
    seed_ru = [
        ("first_scan",   "Первый шаг",          "Первое сканирование QR-кода"),
        ("scanner_10",   "Активный клиент",     "10 сканирований QR"),
        ("scanner_50",   "Постоянный клиент",   "50 сканирований QR"),
        ("scanner_100",  "Преданный клиент",    "100 сканирований QR"),
        ("explorer_3",   "Исследователь",       "Сканирование в 3 разных мерчантах"),
        ("explorer_10",  "Путешественник",      "Сканирование в 10 разных мерчантах"),
        ("spender_100k", "Покупатель",          "Потрачено 100 000 сум"),
        ("spender_1m",   "Большой покупатель",  "Потрачено 1 000 000 сум"),
        ("redeemer_1",   "Первая награда",      "Первая полученная награда"),
        ("redeemer_5",   "Охотник за наградами","Получено 5 наград"),
        ("streak_3",     "Серия 3 дня",         "3 дня подряд активности"),
        ("streak_7",     "Недельная серия",     "7 дней подряд активности"),
        ("streak_30",    "Месячная серия",      "30 дней подряд активности"),
        ("level_5",      "Опытный",             "Достижение 5-го уровня"),
        ("level_10",     "Ветеран",             "Достижение 10-го уровня"),
    ]
    for code, t_ru, d_ru in seed_ru:
        t = t_ru.replace("'", "''")
        d = d_ru.replace("'", "''")
        # Only fill if currently empty so admin edits aren't overwritten on re-run.
        _exec(f"""
            UPDATE achievements
            SET title_ru = '{t}', description_ru = '{d}'
            WHERE code = '{code}' AND (title_ru IS NULL OR title_ru = '')
        """)


def downgrade() -> None:
    _exec("ALTER TABLE achievements DROP COLUMN IF EXISTS title_ru")
    _exec("ALTER TABLE achievements DROP COLUMN IF EXISTS description_ru")
    _exec("ALTER TABLE contests DROP COLUMN IF EXISTS title_ru")
    _exec("ALTER TABLE contests DROP COLUMN IF EXISTS description_ru")
    _exec("ALTER TABLE contests DROP COLUMN IF EXISTS prize_description_ru")
