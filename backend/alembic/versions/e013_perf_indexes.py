"""Add performance indexes flagged in audit.

  - game_sessions(game_type, status, finished_at)  — leaderboard query
  - contests(status, ends_at)                       — finalizer scan
  - user_stats(xp DESC)                             — global leaderboard

Idempotent (CREATE INDEX IF NOT EXISTS).

Revision ID: e013_perf_indexes
Revises: e012_mini_games
Create Date: 2026-04-26
"""
from alembic import op

revision = "e013_perf_indexes"
down_revision = "e012_mini_games"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    _exec("""
        CREATE INDEX IF NOT EXISTS ix_gs_leaderboard
        ON game_sessions (game_type, status, finished_at DESC)
    """)
    _exec("""
        CREATE INDEX IF NOT EXISTS ix_contests_finalizer
        ON contests (status, ends_at)
    """)
    _exec("""
        CREATE INDEX IF NOT EXISTS ix_user_stats_xp_desc
        ON user_stats (xp DESC)
    """)


def downgrade() -> None:
    _exec("DROP INDEX IF EXISTS ix_gs_leaderboard")
    _exec("DROP INDEX IF EXISTS ix_contests_finalizer")
    _exec("DROP INDEX IF EXISTS ix_user_stats_xp_desc")
