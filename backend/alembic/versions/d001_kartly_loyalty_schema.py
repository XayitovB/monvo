"""Kartly loyalty schema: drop old finance tables, add loyalty tables

Revision ID: d001_kartly_loyalty
Revises: c3e8f2a1b004
Create Date: 2026-04-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "d001_kartly_loyalty"
down_revision = "c3e8f2a1b004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Drop old finance tables (oldingi loyiha) ──────────────────────────────────────
    op.execute("DROP TABLE IF EXISTS expenses CASCADE")
    op.execute("DROP TABLE IF EXISTS budget CASCADE")

    # ── Merchants ──────────────────────────────────────────────────────────
    op.create_table(
        "merchants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("business_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(30), server_default=""),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("logo_url", sa.String(500), server_default=""),
        sa.Column("brand_color", sa.String(10), server_default="#0B2545"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_merchant_email", "merchants", ["email"])

    # ── Cards ──────────────────────────────────────────────────────────────
    op.create_table(
        "cards",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("card_uid", sa.String(64), nullable=False, unique=True),
        sa.Column("holder_name", sa.String(150), server_default=""),
        sa.Column("holder_phone", sa.String(30), server_default=""),
        sa.Column("points", sa.Integer, server_default="0", nullable=False),
        sa.Column("tier", sa.String(30), server_default="bronze"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_card_merchant", "cards", ["merchant_id"])
    op.create_index("ix_card_user", "cards", ["user_id"])
    op.create_index("ix_card_uid", "cards", ["card_uid"])

    # ── Rewards ────────────────────────────────────────────────────────────
    op.create_table(
        "rewards",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("points_cost", sa.Integer, nullable=False),
        sa.Column("image_url", sa.String(500), server_default=""),
        sa.Column("stock", sa.Integer, server_default="-1"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_reward_merchant", "rewards", ["merchant_id"])

    # ── Point rules ────────────────────────────────────────────────────────
    op.create_table(
        "point_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), server_default="Default rule"),
        sa.Column("rule_type", sa.String(30), server_default="per_amount"),
        sa.Column("amount_per_point", sa.Numeric(12, 2), server_default="1000"),
        sa.Column("points_per_visit", sa.Integer, server_default="1"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_rule_merchant", "point_rules", ["merchant_id"])

    # ── Transactions ───────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("card_id", sa.Integer,
                  sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reward_id", sa.Integer,
                  sa.ForeignKey("rewards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tx_type", sa.String(20), nullable=False),
        sa.Column("points_delta", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("note", sa.String(300), server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tx_card_created", "transactions", ["card_id", "created_at"])
    op.create_index("ix_tx_merchant_created", "transactions", ["merchant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_tx_merchant_created", table_name="transactions")
    op.drop_index("ix_tx_card_created", table_name="transactions")
    op.drop_table("transactions")

    op.drop_index("ix_rule_merchant", table_name="point_rules")
    op.drop_table("point_rules")

    op.drop_index("ix_reward_merchant", table_name="rewards")
    op.drop_table("rewards")

    op.drop_index("ix_card_uid", table_name="cards")
    op.drop_index("ix_card_user", table_name="cards")
    op.drop_index("ix_card_merchant", table_name="cards")
    op.drop_table("cards")

    op.drop_index("ix_merchant_email", table_name="merchants")
    op.drop_table("merchants")
