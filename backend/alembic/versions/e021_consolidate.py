"""Consolidate inline ALTER TABLE migrations from main.py lifespan.

Up to now main.py was running ~30 idempotent CREATE TABLE / ALTER TABLE
statements on every startup as a fallback because Alembic wasn't always
applied promptly. Move these into a proper Alembic version so the
inline block can be removed from app startup.

Every statement uses IF NOT EXISTS — running this on a database where
all the columns already exist is a no-op, so it's safe to apply on a
production deploy that's been kept current via inline migrations.

Revision ID: e021_consolidate
Revises: e020_seed_billing_plans
Create Date: 2026-05-06

Note: revision id intentionally short — alembic_version.version_num is
VARCHAR(32) and longer ids fail with StringDataRightTruncationError on
the UPDATE that records the applied revision.
"""
from alembic import op


revision = "e021_consolidate"
down_revision = "e020_seed_billing_plans"
branch_labels = None
depends_on = None


_STATEMENTS = [
    # Tariffs jadvali
    """
    CREATE TABLE IF NOT EXISTS tariffs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(80) NOT NULL DEFAULT '',
        title_uz VARCHAR(100) NOT NULL DEFAULT '',
        title_ru VARCHAR(100) NOT NULL DEFAULT '',
        description_uz TEXT DEFAULT '',
        description_ru TEXT DEFAULT '',
        monthly_price INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_recommended BOOLEAN NOT NULL DEFAULT false,
        max_customers INTEGER,
        max_branches INTEGER,
        max_staff INTEGER,
        max_rewards INTEGER,
        max_push_per_month INTEGER,
        max_announcements INTEGER,
        has_tier BOOLEAN NOT NULL DEFAULT false,
        has_gamification BOOLEAN NOT NULL DEFAULT false,
        has_games BOOLEAN NOT NULL DEFAULT false,
        has_birthday_bonus BOOLEAN NOT NULL DEFAULT false,
        has_segments_advanced BOOLEAN NOT NULL DEFAULT false,
        has_card_design_custom BOOLEAN NOT NULL DEFAULT false,
        has_api_access BOOLEAN NOT NULL DEFAULT false,
        has_priority_support BOOLEAN NOT NULL DEFAULT false,
        has_scheduled_push BOOLEAN NOT NULL DEFAULT false,
        extra_features JSON DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    # Merchant tariff ustunlari
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL",
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_started_at TIMESTAMPTZ",
    "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_expires_at TIMESTAMPTZ",
    # AppSettings — gamification + POS toggles
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS gamification_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_billz_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_iiko_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_yclients_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_rkeeper_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_onec_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_poster_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pos_moysklad_enabled BOOLEAN NOT NULL DEFAULT false",
    "UPDATE app_settings SET pos_billz_enabled = true WHERE id = 1 AND pos_billz_enabled = false",
    "UPDATE app_settings SET pos_iiko_enabled = true WHERE id = 1 AND pos_iiko_enabled = false",
    # AuditLog — qurilma metadata
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip VARCHAR(45) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS os_version VARCHAR(40) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS app_version VARCHAR(40) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_model VARCHAR(100) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_uid VARCHAR(80) DEFAULT ''",
    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS extra JSON DEFAULT '{}'",
    # Cards — branch_id, holder_birth_date
    "ALTER TABLE cards ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES merchant_branches(id) ON DELETE SET NULL",
    "ALTER TABLE cards ADD COLUMN IF NOT EXISTS holder_birth_date TIMESTAMPTZ",
    # Transactions — branch_id, staff_id, applied_rules, reward_id
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES merchant_branches(id) ON DELETE SET NULL",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES merchant_staff(id) ON DELETE SET NULL",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS applied_rules JSON DEFAULT '[]'",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reward_id INTEGER REFERENCES rewards(id) ON DELETE SET NULL",
    # Rewards — konstruktor ustunlari
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'general'",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS min_tier VARCHAR(20) DEFAULT 'bronze'",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS icon VARCHAR(30) DEFAULT 'gift'",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS color VARCHAR(10) DEFAULT '#7C3AED'",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS terms TEXT DEFAULT ''",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS max_per_user INTEGER DEFAULT -1",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ",
    "ALTER TABLE rewards ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 100",
    # Users — birth_date (birthday bonus)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TIMESTAMPTZ",
    # Loyalty rules — qo'shimcha maydonlar
    "ALTER TABLE loyalty_rules ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''",
    "ALTER TABLE loyalty_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100",
    # Landing CMS — logos
    """
    CREATE TABLE IF NOT EXISTS landing_logos (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        image_url TEXT NOT NULL,
        href VARCHAR(500) NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_landing_logos_active_order ON landing_logos (is_active, sort_order)",
    "ALTER TABLE landing_logos ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'partner'",
    "CREATE INDEX IF NOT EXISTS ix_landing_logos_cat_active_order ON landing_logos (category, is_active, sort_order)",
    # Landing CMS — reviews
    """
    CREATE TABLE IF NOT EXISTS landing_reviews (
        id SERIAL PRIMARY KEY,
        quote_uz TEXT NOT NULL,
        quote_ru TEXT NOT NULL DEFAULT '',
        author_name VARCHAR(120) NOT NULL,
        author_role_uz VARCHAR(160) NOT NULL DEFAULT '',
        author_role_ru VARCHAR(160) NOT NULL DEFAULT '',
        avatar_url TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 5,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_featured BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_landing_reviews_active_order ON landing_reviews (is_active, sort_order)",
    # Payme transactions — JSON-RPC
    """
    CREATE TABLE IF NOT EXISTS payme_transactions (
        id SERIAL PRIMARY KEY,
        paycom_id VARCHAR(64) UNIQUE NOT NULL,
        paycom_time_ms BIGINT NOT NULL,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL,
        amount_tiyin BIGINT NOT NULL,
        state INTEGER NOT NULL DEFAULT 1,
        reason INTEGER,
        create_time_ms BIGINT,
        perform_time_ms BIGINT,
        cancel_time_ms BIGINT,
        raw_account JSON NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_payme_invoice ON payme_transactions (invoice_id)",
    "CREATE INDEX IF NOT EXISTS ix_payme_merchant_state ON payme_transactions (merchant_id, state)",
    "CREATE INDEX IF NOT EXISTS ix_payme_state_create ON payme_transactions (state, create_time_ms)",
    # Login attempts
    """
    CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        identifier VARCHAR(200) NOT NULL,
        role VARCHAR(20) NOT NULL,
        user_id INTEGER,
        success BOOLEAN NOT NULL DEFAULT false,
        error_reason VARCHAR(40) NOT NULL DEFAULT '',
        ip VARCHAR(45) NOT NULL DEFAULT '',
        user_agent VARCHAR(500) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_login_attempts_identifier_time ON login_attempts (identifier, created_at)",
    "CREATE INDEX IF NOT EXISTS ix_login_attempts_role_success_time ON login_attempts (role, success, created_at)",
    # Merchant API tokens
    """
    CREATE TABLE IF NOT EXISTS merchant_api_tokens (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        token_prefix VARCHAR(20) NOT NULL,
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        last_used_at TIMESTAMPTZ,
        last_used_ip VARCHAR(45) NOT NULL DEFAULT '',
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_api_tokens_merchant ON merchant_api_tokens (merchant_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_api_tokens_hash ON merchant_api_tokens (token_hash)",
]


def upgrade() -> None:
    for stmt in _STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    # Bu migratsiya o'nlab IF NOT EXISTS qadamlari to'plami — har birini
    # downgrade qilish ma'nosi yo'q (boshqa kodlar shu ustunlarga tayanadi).
    # Agar haqiqatan kerak bo'lsa, individual revisiyalardan foydalaning.
    pass
