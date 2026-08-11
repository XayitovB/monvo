"""Add mini games: game_sessions, spin_prizes, spin_history.

Seeds 8 default spin prizes (mostly small XP, few big ones — house-edge
tuned so the average expected value is reasonable). Idempotent.

Revision ID: e012_mini_games
Revises: e011_bilingual_gamification
Create Date: 2026-04-26
"""
from alembic import op

revision = "e012_mini_games"
down_revision = "e011_bilingual_gamification"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    # ─── game_sessions ───────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS game_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_type VARCHAR(20) NOT NULL,
            session_token VARCHAR(64) NOT NULL UNIQUE,
            score INTEGER NOT NULL DEFAULT 0,
            xp_earned INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'started',
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            finished_at TIMESTAMP WITH TIME ZONE
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_gs_user_started ON game_sessions (user_id, started_at)")
    _exec("CREATE INDEX IF NOT EXISTS ix_gs_game_score ON game_sessions (game_type, score)")

    # ─── spin_prizes ─────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS spin_prizes (
            id SERIAL PRIMARY KEY,
            label VARCHAR(100) NOT NULL,
            label_ru VARCHAR(100) DEFAULT '',
            xp INTEGER NOT NULL DEFAULT 0,
            weight INTEGER NOT NULL DEFAULT 10,
            color VARCHAR(10) DEFAULT '#7C3AED',
            icon VARCHAR(50) DEFAULT 'gift',
            is_active BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 100,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # ─── spin_history ────────────────────────────────────────────────────────
    _exec("""
        CREATE TABLE IF NOT EXISTS spin_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            prize_id INTEGER REFERENCES spin_prizes(id) ON DELETE SET NULL,
            prize_label VARCHAR(100) DEFAULT '',
            xp_won INTEGER DEFAULT 0,
            won_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _exec("CREATE INDEX IF NOT EXISTS ix_spin_user_time ON spin_history (user_id, won_at)")

    # ─── Seed default spin prizes ────────────────────────────────────────────
    # weights tuned so jackpot is rare; expected XP per spin ≈ 90
    seed = [
        # label_uz, label_ru, xp, weight, color, icon, sort
        ("50 XP",     "50 XP",       50,   30, "#10B981", "zap",      10),
        ("100 XP",    "100 XP",      100,  25, "#3B82F6", "star",     20),
        ("25 XP",     "25 XP",       25,   18, "#94A3B8", "gift",     30),
        ("200 XP",    "200 XP",      200,  12, "#F59E0B", "trophy",   40),
        ("Bo'sh",     "Пусто",       0,    8,  "#475569", "x",        50),
        ("500 XP",    "500 XP",      500,  4,  "#EC4899", "crown",    60),
        ("75 XP",     "75 XP",       75,   2,  "#A855F7", "sparkles", 70),
        ("1000 XP 💎","1000 XP 💎",  1000, 1,  "#EF4444", "gem",      80),
    ]
    for row in seed:
        label, label_ru, xp, weight, color, icon, sort = row
        l = label.replace("'", "''")
        lr = label_ru.replace("'", "''")
        # Insert only if no prize with this label exists yet
        _exec(f"""
            INSERT INTO spin_prizes (label, label_ru, xp, weight, color, icon, sort_order)
            SELECT '{l}', '{lr}', {xp}, {weight}, '{color}', '{icon}', {sort}
            WHERE NOT EXISTS (SELECT 1 FROM spin_prizes WHERE label = '{l}')
        """)


def downgrade() -> None:
    _exec("DROP TABLE IF EXISTS spin_history CASCADE")
    _exec("DROP TABLE IF EXISTS spin_prizes CASCADE")
    _exec("DROP TABLE IF EXISTS game_sessions CASCADE")
