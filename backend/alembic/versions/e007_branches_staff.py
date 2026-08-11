"""Branches + Staff tables

Revision ID: e007_branches_staff
Revises: e006_merchant_business_type
Create Date: 2026-04-21 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e007_branches_staff"
down_revision = "e006_merchant_business_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "branches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("address", sa.String(300), server_default=""),
        sa.Column("phone", sa.String(30), server_default=""),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )
    op.create_index("ix_branch_merchant", "branches", ["merchant_id"])

    op.create_table(
        "staff",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_id", sa.Integer,
                  sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Integer,
                  sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("staff_role", sa.String(20), server_default="cashier"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("merchant_id", "phone", name="uq_staff_merchant_phone"),
    )
    op.create_index("ix_staff_merchant", "staff", ["merchant_id"])
    op.create_index("ix_staff_branch", "staff", ["branch_id"])


def downgrade() -> None:
    op.drop_index("ix_staff_branch", table_name="staff")
    op.drop_index("ix_staff_merchant", table_name="staff")
    op.drop_table("staff")
    op.drop_index("ix_branch_merchant", table_name="branches")
    op.drop_table("branches")
