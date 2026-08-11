"""Create demo_leads table for landing form submissions.

Model exists in models.py (DemoLead) but table was never created on
production DB. Demo form submits crashed with UndefinedTableError.

Revision ID: e031_demo_leads
Revises: e030_delete_tariff_999k
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = "e031_demo_leads"
down_revision = "e030_delete_tariff_999k"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(150), nullable=True, server_default=""),
        sa.Column("phone", sa.String(40), nullable=True, server_default=""),
        sa.Column("business_name", sa.String(200), nullable=True, server_default=""),
        sa.Column("business_type", sa.String(80), nullable=True, server_default=""),
        sa.Column("source", sa.String(80), nullable=True, server_default="landing-demo-form"),
        sa.Column(
            "telegram_sent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_demo_leads_created", "demo_leads", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_demo_leads_created", table_name="demo_leads")
    op.drop_table("demo_leads")
