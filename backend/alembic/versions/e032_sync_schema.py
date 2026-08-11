"""e032_sync_schema — modellar bilan sxemani moslash (idempotent)

Maqsad: `alembic upgrade head` TOZA bazada ham to'liq sxema yaratsin.
Avvalgi migratsiyalar (e001..e031) bir qancha jadval/ustunni qamramagan
edi — ular faqat inline DDL (_ensure_*) yoki dev create_all orqali
yaratilardi. Bu migratsiya o'sha bo'shliqni yopadi.

⚠️ IDEMPOTENT: barcha amallar IF NOT EXISTS — prod'da jadvallar allaqachon
mavjud (no-op), toza serverda yaratiladi. autogenerate'ning spurious
server_default/type o'zgarishlari ATAYIN kiritilmadi (ular zararli).

Revision ID: e032_sync_schema
Revises: e031_demo_leads
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e032_sync_schema"
down_revision: Union[str, None] = "e031_demo_leads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Yetishmayotgan jadvallar (idempotent) ────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS holdings (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            description TEXT,
            logo_url TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS holding_merchants (
            id SERIAL PRIMARY KEY,
            holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            added_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_hm_holding ON holding_merchants (holding_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_hm_merchant_unique ON holding_merchants (merchant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS holding_members (
            id SERIAL PRIMARY KEY,
            holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(30),
            added_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_hmem_holding_user ON holding_members (holding_id, user_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS merchant_inbox_messages (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            body TEXT NOT NULL,
            icon VARCHAR(50),
            tone VARCHAR(20),
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_minbox_merchant_created ON merchant_inbox_messages (merchant_id, created_at)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS wishlists (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_wishlist_user ON wishlists (user_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_wishlist_user_reward ON wishlists (user_id, reward_id)")

    # ── Yetishmayotgan ustunlar (idempotent) ─────────────────────────────────
    # app_settings — telegram + payme integratsiya ustunlari
    for col, ddl in [
        ("telegram_bot_token", "VARCHAR(200) NOT NULL DEFAULT ''"),
        ("telegram_chat_id", "VARCHAR(100) NOT NULL DEFAULT ''"),
        ("telegram_enabled", "BOOLEAN NOT NULL DEFAULT false"),
        ("payme_merchant_id", "VARCHAR(100) NOT NULL DEFAULT ''"),
        ("payme_key", "VARCHAR(200) NOT NULL DEFAULT ''"),
        ("payme_test_key", "VARCHAR(200) NOT NULL DEFAULT ''"),
        ("payme_test_mode", "BOOLEAN NOT NULL DEFAULT false"),
        ("payme_checkout_url", "VARCHAR(200) NOT NULL DEFAULT 'https://checkout.paycom.uz'"),
    ]:
        op.execute(f"ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS {col} {ddl}")

    # Yagona obuna manbai — invoices/merchant_subscriptions.tariff_id
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE merchant_subscriptions ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL")

    # users.telegram_id (Telegram orqali kirish)
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(50)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telegram_id ON users (telegram_id)")

    # ── Data-heal: tariff_id ⇄ merchant.tariff_id sinxron ────────────────────
    op.execute(
        """
        UPDATE merchant_subscriptions s SET tariff_id = m.tariff_id
        FROM merchants m
        WHERE s.merchant_id = m.id AND s.tariff_id IS NULL AND m.tariff_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE merchants m SET tariff_id = s.tariff_id
        FROM merchant_subscriptions s
        WHERE m.id = s.merchant_id AND m.tariff_id IS NULL AND s.tariff_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_telegram_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS telegram_id")
    op.execute("ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS tariff_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS tariff_id")
    for col in (
        "telegram_bot_token", "telegram_chat_id", "telegram_enabled",
        "payme_merchant_id", "payme_key", "payme_test_key",
        "payme_test_mode", "payme_checkout_url",
    ):
        op.execute(f"ALTER TABLE app_settings DROP COLUMN IF EXISTS {col}")
    op.execute("DROP TABLE IF EXISTS wishlists")
    op.execute("DROP TABLE IF EXISTS merchant_inbox_messages")
    op.execute("DROP TABLE IF EXISTS holding_members")
    op.execute("DROP TABLE IF EXISTS holding_merchants")
    op.execute("DROP TABLE IF EXISTS holdings")
