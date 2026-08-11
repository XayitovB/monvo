"""Create all missing major tables (idempotent) — schema matches models.py.

Previous revision of this file used guessed column names (e.g. ``page_views
.created_at`` when the model actually uses ``timestamp``) which crashed
``CREATE INDEX`` once tables were already created by ``create_all``.

This revision aligns every column and every index with the live model
definitions in ``backend/models.py``.  All DDL uses ``IF NOT EXISTS`` so
it is safe to re-run on a database that already has some of the tables.

Each statement is issued separately because asyncpg rejects multi-command
prepared statements.

Revision ID: e009_missing_major_tables
Revises: e008_missing_columns
Create Date: 2026-04-24
"""
from alembic import op

revision = "e009_missing_major_tables"
down_revision = "e008_missing_columns"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    # ─── app_links (singleton-ish, no id constraint) ─────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS app_links (
            id SERIAL PRIMARY KEY,
            android_url VARCHAR(500) DEFAULT '',
            ios_url VARCHAR(500) DEFAULT '',
            telegram_url VARCHAR(500) DEFAULT '',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_by VARCHAR(100)
        )
    """)

    # ─── page_views (model uses `timestamp`, not created_at) ─────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS page_views (
            id SERIAL PRIMARY KEY,
            path VARCHAR(200) DEFAULT '/',
            ip_hash VARCHAR(64),
            country VARCHAR(4),
            referrer VARCHAR(500),
            user_agent VARCHAR(300),
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_pv_timestamp ON page_views (timestamp)")
    _exec("CREATE INDEX IF NOT EXISTS ix_pv_path ON page_views (path)")

    # ─── waitlist ────────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS waitlist (
            id SERIAL PRIMARY KEY,
            email VARCHAR(200) NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_waitlist_email ON waitlist (email)")

    # ─── app_settings (singleton row id=1) ───────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS app_settings (
            id SERIAL PRIMARY KEY,
            app_name VARCHAR(100) DEFAULT 'Monvo',
            logo_url VARCHAR(500) DEFAULT '',
            primary_color VARCHAR(10) DEFAULT '#0B2545',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_by VARCHAR(100) DEFAULT 'admin'
        )
    """)
    _exec("INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING")

    # ─── Merchant branches / staff / campaigns ───────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_branches (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            address VARCHAR(500) DEFAULT '',
            phone VARCHAR(30) DEFAULT '',
            lat NUMERIC(10, 6),
            lng NUMERIC(10, 6),
            working_hours VARCHAR(100) DEFAULT '',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_merchant_branches_merchant ON merchant_branches (merchant_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_staff (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            branch_id INTEGER REFERENCES merchant_branches(id) ON DELETE SET NULL,
            username VARCHAR(50) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(100) DEFAULT '',
            phone VARCHAR(30) DEFAULT '',
            role VARCHAR(30) DEFAULT 'cashier',
            is_active BOOLEAN DEFAULT TRUE,
            last_login_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_merchant_staff_merchant_username UNIQUE (merchant_id, username)
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_merchant_staff_merchant ON merchant_staff (merchant_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_campaigns (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            campaign_type VARCHAR(30) DEFAULT 'boost',
            config JSONB DEFAULT '{}'::jsonb,
            target_segment VARCHAR(50) DEFAULT 'all',
            status VARCHAR(20) DEFAULT 'draft',
            starts_at TIMESTAMP WITH TIME ZONE,
            ends_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) DEFAULT ''
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_campaign_merchant_status ON merchant_campaigns (merchant_id, status)")

    # ─── Notifications (merchant-scoped) ─────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_notification_templates (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            channel VARCHAR(20) DEFAULT 'push',
            title VARCHAR(200) DEFAULT '',
            body TEXT DEFAULT '',
            target_segment VARCHAR(50) DEFAULT 'all',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_tmpl_merchant ON merchant_notification_templates (merchant_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_notification_logs (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            template_id INTEGER REFERENCES merchant_notification_templates(id) ON DELETE SET NULL,
            channel VARCHAR(20) DEFAULT 'push',
            title VARCHAR(200) DEFAULT '',
            body TEXT DEFAULT '',
            target VARCHAR(100) DEFAULT 'all',
            sent_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # ─── Merchant reviews ────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_reviews (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            rating INTEGER DEFAULT 5,
            comment TEXT DEFAULT '',
            is_published BOOLEAN DEFAULT TRUE,
            reply TEXT DEFAULT '',
            replied_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_review_merchant_created ON merchant_reviews (merchant_id, created_at)")
    _exec("CREATE INDEX IF NOT EXISTS ix_review_rating ON merchant_reviews (rating)")

    # ─── Announcements ────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            body TEXT DEFAULT '',
            type VARCHAR(20) DEFAULT 'info',
            target VARCHAR(30) DEFAULT 'all',
            cta_label VARCHAR(80) DEFAULT '',
            cta_url VARCHAR(500) DEFAULT '',
            is_active BOOLEAN DEFAULT TRUE,
            starts_at TIMESTAMP WITH TIME ZONE,
            ends_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) DEFAULT 'admin'
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_ann_active_target ON announcements (is_active, target)")

    # ─── Billing ──────────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS billing_plans (
            id SERIAL PRIMARY KEY,
            key VARCHAR(30) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            description TEXT DEFAULT '',
            price_monthly NUMERIC(10, 2) DEFAULT 0,
            price_yearly NUMERIC(10, 2) DEFAULT 0,
            max_cards INTEGER DEFAULT -1,
            max_rewards INTEGER DEFAULT -1,
            max_branches INTEGER DEFAULT 1,
            features JSONB DEFAULT '{}'::jsonb,
            sort_order INTEGER DEFAULT 100,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    _exec("""
        CREATE TABLE IF NOT EXISTS merchant_subscriptions (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
            plan_id INTEGER REFERENCES billing_plans(id) ON DELETE SET NULL,
            status VARCHAR(20) DEFAULT 'active',
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            renewed_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_sub_merchant ON merchant_subscriptions (merchant_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            plan_id INTEGER REFERENCES billing_plans(id) ON DELETE SET NULL,
            invoice_number VARCHAR(50) DEFAULT '',
            amount NUMERIC(12, 2) DEFAULT 0,
            currency VARCHAR(5) DEFAULT 'UZS',
            status VARCHAR(20) DEFAULT 'pending',
            period_start TIMESTAMP WITH TIME ZONE,
            period_end TIMESTAMP WITH TIME ZONE,
            paid_at TIMESTAMP WITH TIME ZONE,
            note TEXT DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_inv_merchant_status ON invoices (merchant_id, status)")
    _exec("CREATE INDEX IF NOT EXISTS ix_inv_created ON invoices (created_at)")

    # ─── Multi-admin ──────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(100) DEFAULT '',
            email VARCHAR(100) DEFAULT '',
            role VARCHAR(30) DEFAULT 'support',
            is_active BOOLEAN DEFAULT TRUE,
            last_login_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) DEFAULT 'admin'
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_adminuser_active ON admin_users (is_active)")

    # ─── Loyalty engine tables ───────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS loyalty_rules (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            rule_type VARCHAR(40) NOT NULL,
            name VARCHAR(150) DEFAULT '',
            description TEXT DEFAULT '',
            is_active BOOLEAN DEFAULT TRUE,
            priority INTEGER DEFAULT 100,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_loyalty_merchant ON loyalty_rules (merchant_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_loyalty_merchant_active ON loyalty_rules (merchant_id, is_active)")

    _exec("""
        CREATE TABLE IF NOT EXISTS loyalty_progress (
            id SERIAL PRIMARY KEY,
            rule_id INTEGER NOT NULL REFERENCES loyalty_rules(id) ON DELETE CASCADE,
            card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
            progress_count INTEGER DEFAULT 0,
            progress_amount NUMERIC(14, 2) DEFAULT 0,
            period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_reward_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_progress_rule_card UNIQUE (rule_id, card_id)
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_progress_card ON loyalty_progress (card_id)")

    # ─── A/B Testing ─────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS experiments (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            description TEXT DEFAULT '',
            hypothesis TEXT DEFAULT '',
            primary_metric VARCHAR(50) DEFAULT 'conversion',
            status VARCHAR(20) DEFAULT 'draft',
            merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL,
            started_at TIMESTAMP WITH TIME ZONE,
            ended_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) DEFAULT 'admin'
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_exp_status ON experiments (status)")
    _exec("CREATE INDEX IF NOT EXISTS ix_exp_merchant ON experiments (merchant_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS experiment_variants (
            id SERIAL PRIMARY KEY,
            experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
            name VARCHAR(80) NOT NULL,
            description TEXT DEFAULT '',
            is_control BOOLEAN DEFAULT FALSE,
            weight INTEGER DEFAULT 50,
            CONSTRAINT uq_exp_variant_name UNIQUE (experiment_id, name)
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_var_exp ON experiment_variants (experiment_id)")

    _exec("""
        CREATE TABLE IF NOT EXISTS experiment_events (
            id SERIAL PRIMARY KEY,
            experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
            variant_id INTEGER NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            event_type VARCHAR(30) NOT NULL,
            value NUMERIC(12, 2) DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_ev_exp_variant ON experiment_events (experiment_id, variant_id)")
    _exec("CREATE INDEX IF NOT EXISTS ix_ev_exp_type ON experiment_events (experiment_id, event_type)")

    # ─── AuditLog: user_id nullable + actor column ───────────────────────────
    _exec("ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL")
    _exec("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor VARCHAR(100) DEFAULT ''")

    # ─── Fix CASCADE on AuditLog.user_id / FCMToken.user_id ──────────────────
    _exec("""
        DO $$
        DECLARE
            cname TEXT;
        BEGIN
            SELECT conname INTO cname
                FROM pg_constraint
                WHERE conrelid = 'audit_logs'::regclass
                  AND contype = 'f'
                  AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                      WHERE attrelid = 'audit_logs'::regclass
                                        AND attname = 'user_id')];
            IF cname IS NOT NULL THEN
                EXECUTE format('ALTER TABLE audit_logs DROP CONSTRAINT %I', cname);
            END IF;
            ALTER TABLE audit_logs
                ADD CONSTRAINT audit_logs_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END$$;
    """)

    _exec("""
        DO $$
        DECLARE
            cname TEXT;
        BEGIN
            SELECT conname INTO cname
                FROM pg_constraint
                WHERE conrelid = 'fcm_tokens'::regclass
                  AND contype = 'f'
                  AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                      WHERE attrelid = 'fcm_tokens'::regclass
                                        AND attname = 'user_id')];
            IF cname IS NOT NULL THEN
                EXECUTE format('ALTER TABLE fcm_tokens DROP CONSTRAINT %I', cname);
            END IF;
            ALTER TABLE fcm_tokens
                ADD CONSTRAINT fcm_tokens_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END$$;
    """)


def downgrade() -> None:
    for table in [
        "experiment_events", "experiment_variants", "experiments",
        "loyalty_progress", "loyalty_rules",
        "invoices", "merchant_subscriptions", "billing_plans",
        "admin_users", "announcements",
        "merchant_reviews",
        "merchant_notification_logs", "merchant_notification_templates",
        "merchant_campaigns", "merchant_staff", "merchant_branches",
        "app_settings", "waitlist", "page_views", "app_links",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
