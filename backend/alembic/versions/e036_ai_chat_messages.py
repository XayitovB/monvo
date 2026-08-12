"""AI assistant chat history — admin va merchant panellardagi to'liq
ekranli chat uchun suhbat xotirasi.

Revision ID: e036_ai_chat_messages
Revises: e035_telegram_bot_users
Create Date: 2026-08-12
"""
from alembic import op


revision = "e036_ai_chat_messages"
down_revision = "e035_telegram_bot_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_chat_messages (
            id         SERIAL PRIMARY KEY,
            owner_type VARCHAR(20)  NOT NULL,
            owner_key  VARCHAR(100) NOT NULL,
            role       VARCHAR(20)  NOT NULL,
            content    TEXT         NOT NULL,
            created_at TIMESTAMPTZ  DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_ai_chat_owner_created "
        "ON ai_chat_messages (owner_type, owner_key, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_chat_messages")
