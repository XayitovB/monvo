"""Add missing columns to users/merchants/cards (idempotent).

These columns were introduced in the models but never migrated:
  users.birth_date         — birthday bonus
  merchants.card_design    — card design JSON constructor
  merchants.custom_tiers   — tier constructor JSON
  cards.holder_birth_date  — per-card holder birthday
  cards.tags               — JSON tag list
  cards.notes              — free-text notes
  cards.branch_id          — FK to merchant_branches (nullable)

Uses raw `ADD COLUMN IF NOT EXISTS` for idempotency — safe to re-run
against a database where `create_all` already provisioned some columns.

Revision ID: e008_missing_columns
Revises: e007_branches_staff
Create Date: 2026-04-24
"""
from alembic import op

revision = "e008_missing_columns"
down_revision = "e007_branches_staff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TIMESTAMP WITH TIME ZONE"
    )
    # Merchants
    op.execute(
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS card_design JSONB DEFAULT '{}'::jsonb"
    )
    op.execute(
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS custom_tiers JSONB DEFAULT '[]'::jsonb"
    )
    # Cards
    op.execute(
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS holder_birth_date TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb"
    )
    op.execute(
        "ALTER TABLE cards ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''"
    )
    # branch_id FK (merchant_branches may or may not exist yet — add column only if referenced table present)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='merchant_branches') THEN
                ALTER TABLE cards ADD COLUMN IF NOT EXISTS branch_id INTEGER
                    REFERENCES merchant_branches(id) ON DELETE SET NULL;
            ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='branches') THEN
                ALTER TABLE cards ADD COLUMN IF NOT EXISTS branch_id INTEGER
                    REFERENCES branches(id) ON DELETE SET NULL;
            ELSE
                ALTER TABLE cards ADD COLUMN IF NOT EXISTS branch_id INTEGER;
            END IF;
        END$$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS birth_date")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS card_design")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS custom_tiers")
    op.execute("ALTER TABLE cards DROP COLUMN IF EXISTS holder_birth_date")
    op.execute("ALTER TABLE cards DROP COLUMN IF EXISTS tags")
    op.execute("ALTER TABLE cards DROP COLUMN IF EXISTS notes")
    op.execute("ALTER TABLE cards DROP COLUMN IF EXISTS branch_id")
