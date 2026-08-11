"""Telegram bot users table — interaction log for both bots.

Records everyone who messages the customer bot or the merchant bot
(@Monvo_business_bot), so the admin panel can list bot users per bot.

Revision ID: e035_telegram_bot_users
Revises: e034_unify_tariffs
Create Date: 2026-06-16
"""
from alembic import op


revision = "e035_telegram_bot_users"
down_revision = "e034_unify_tariffs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS telegram_bot_users (
            id            SERIAL PRIMARY KEY,
            bot           VARCHAR(20)  NOT NULL,
            telegram_id   VARCHAR(50)  NOT NULL,
            username      VARCHAR(150) NOT NULL DEFAULT '',
            first_name    VARCHAR(200) NOT NULL DEFAULT '',
            last_name     VARCHAR(200) NOT NULL DEFAULT '',
            language_code VARCHAR(10)  NOT NULL DEFAULT '',
            message_count INTEGER      NOT NULL DEFAULT 1,
            first_seen    TIMESTAMPTZ  DEFAULT NOW(),
            last_seen     TIMESTAMPTZ  DEFAULT NOW(),
            CONSTRAINT uq_botuser_bot_tgid UNIQUE (bot, telegram_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_botuser_bot_lastseen "
        "ON telegram_bot_users (bot, last_seen)"
    )
    # Customer bot — mavjud telegram_id'li userlardan backfill (tarixiy ro'yxat).
    op.execute(
        """
        INSERT INTO telegram_bot_users
            (bot, telegram_id, first_name, language_code, first_seen, last_seen, message_count)
        SELECT 'customer', u.telegram_id, COALESCE(u.name, ''), COALESCE(u.language, ''),
               COALESCE(u.created_at, NOW()), COALESCE(u.created_at, NOW()), 1
        FROM users u
        WHERE u.telegram_id IS NOT NULL AND u.telegram_id <> ''
        ON CONFLICT (bot, telegram_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS telegram_bot_users")
