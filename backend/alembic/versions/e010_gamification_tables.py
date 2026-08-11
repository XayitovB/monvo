"""Add gamification tables: user_stats, achievements, user_achievements, contests, contest_participants.

Idempotent — uses IF NOT EXISTS so it can be re-run on databases where some
tables already exist (e.g. dev environments using create_all).

Also seeds a small default achievement catalog so the feature works out of
the box without requiring admin to populate it first.

Revision ID: e010_gamification_tables
Revises: e009_missing_major_tables
Create Date: 2026-04-26
"""
from alembic import op

revision = "e010_gamification_tables"
down_revision = "e009_missing_major_tables"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    # ─── user_stats ──────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS user_stats (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            total_scans INTEGER NOT NULL DEFAULT 0,
            total_redeems INTEGER NOT NULL DEFAULT 0,
            total_spent NUMERIC(14, 2) NOT NULL DEFAULT 0,
            unique_merchants INTEGER NOT NULL DEFAULT 0,
            streak_days INTEGER NOT NULL DEFAULT 0,
            longest_streak INTEGER NOT NULL DEFAULT 0,
            last_activity_date TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_user_stats_xp ON user_stats (xp)")
    _exec("CREATE INDEX IF NOT EXISTS ix_user_stats_level ON user_stats (level)")

    # ─── achievements ────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS achievements (
            id SERIAL PRIMARY KEY,
            code VARCHAR(50) NOT NULL UNIQUE,
            title VARCHAR(150) NOT NULL,
            description TEXT DEFAULT '',
            icon VARCHAR(50) DEFAULT 'trophy',
            color VARCHAR(10) DEFAULT '#F59E0B',
            category VARCHAR(30) DEFAULT 'general',
            criteria_type VARCHAR(40) NOT NULL,
            criteria_threshold INTEGER NOT NULL DEFAULT 1,
            xp_reward INTEGER NOT NULL DEFAULT 100,
            is_active BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 100,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_ach_active_category ON achievements (is_active, category)")

    # ─── user_achievements ───────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
            earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_user_ach_user ON user_achievements (user_id)")

    # ─── contests ────────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS contests (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            icon VARCHAR(50) DEFAULT 'trophy',
            banner_url VARCHAR(500) DEFAULT '',
            contest_type VARCHAR(40) NOT NULL,
            merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
            status VARCHAR(20) DEFAULT 'draft',
            starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
            ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
            prize_description TEXT DEFAULT '',
            prize_xp INTEGER DEFAULT 1000,
            max_winners INTEGER DEFAULT 10,
            auto_join BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) DEFAULT 'admin'
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_contest_status_dates ON contests (status, starts_at, ends_at)")
    _exec("CREATE INDEX IF NOT EXISTS ix_contest_merchant ON contests (merchant_id)")

    # ─── contest_participants ────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS contest_participants (
            id SERIAL PRIMARY KEY,
            contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            score INTEGER NOT NULL DEFAULT 0,
            rank INTEGER DEFAULT 0,
            is_winner BOOLEAN DEFAULT FALSE,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_contest_user UNIQUE (contest_id, user_id)
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_cp_contest_score ON contest_participants (contest_id, score)")

    # ─── Seed default achievements (idempotent via ON CONFLICT) ──────────────
    seed_rows = [
        # code, title, description, icon, color, category, criteria_type, threshold, xp_reward, sort
        ("first_scan", "Birinchi qadam", "Birinchi marta QR scan qilish", "qr-code", "#10B981", "scanner", "total_scans", 1, 50, 10),
        ("scanner_10", "Faol mijoz", "10 ta QR scan", "scan", "#10B981", "scanner", "total_scans", 10, 200, 20),
        ("scanner_50", "Doimiy mijoz", "50 ta QR scan", "zap", "#10B981", "scanner", "total_scans", 50, 500, 30),
        ("scanner_100", "Sodiq mijoz", "100 ta QR scan", "award", "#10B981", "scanner", "total_scans", 100, 1000, 40),
        ("explorer_3", "Tadqiqotchi", "3 ta turli merchantda scan", "compass", "#3B82F6", "explorer", "unique_merchants", 3, 150, 50),
        ("explorer_10", "Sayohatchi", "10 ta turli merchantda scan", "map", "#3B82F6", "explorer", "unique_merchants", 10, 500, 60),
        ("spender_100k", "Xaridchi", "100,000 so'm sarflash", "shopping-bag", "#F59E0B", "spender", "total_spent", 100000, 200, 70),
        ("spender_1m", "Katta xaridchi", "1,000,000 so'm sarflash", "trending-up", "#F59E0B", "spender", "total_spent", 1000000, 1000, 80),
        ("redeemer_1", "Birinchi mukofot", "Birinchi marta mukofot olish", "gift", "#EC4899", "general", "total_redeems", 1, 100, 90),
        ("redeemer_5", "Mukofot ovchisi", "5 ta mukofot olish", "star", "#EC4899", "general", "total_redeems", 5, 300, 100),
        ("streak_3", "3 kunlik streak", "3 kun ketma-ket faollik", "flame", "#EF4444", "streak", "streak_days", 3, 100, 110),
        ("streak_7", "Haftalik streak", "7 kun ketma-ket faollik", "flame", "#EF4444", "streak", "streak_days", 7, 300, 120),
        ("streak_30", "Oylik streak", "30 kun ketma-ket faollik", "flame", "#DC2626", "streak", "streak_days", 30, 1500, 130),
        ("level_5", "Tajribali", "5-darajaga yetish", "shield", "#7C3AED", "general", "level_reached", 5, 250, 140),
        ("level_10", "Veteran", "10-darajaga yetish", "crown", "#7C3AED", "general", "level_reached", 10, 750, 150),
    ]
    for row in seed_rows:
        code, title, desc, icon, color, cat, ctype, thr, xp, sort = row
        # Use parameterized SQL via op.execute would require sqlalchemy.text; easier: escape minimal
        title_e = title.replace("'", "''")
        desc_e = desc.replace("'", "''")
        _exec(f"""
            INSERT INTO achievements
                (code, title, description, icon, color, category, criteria_type, criteria_threshold, xp_reward, sort_order)
            VALUES
                ('{code}', '{title_e}', '{desc_e}', '{icon}', '{color}', '{cat}', '{ctype}', {thr}, {xp}, {sort})
            ON CONFLICT (code) DO NOTHING
        """)


def downgrade() -> None:
    _exec("DROP TABLE IF EXISTS contest_participants CASCADE")
    _exec("DROP TABLE IF EXISTS contests CASCADE")
    _exec("DROP TABLE IF EXISTS user_achievements CASCADE")
    _exec("DROP TABLE IF EXISTS achievements CASCADE")
    _exec("DROP TABLE IF EXISTS user_stats CASCADE")
