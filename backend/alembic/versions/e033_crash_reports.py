"""Create crash_reports table for mobile crash reporting.

Mobil ilova crash/xatolarni backend'ga yuboradi; admin panelda sabab
batafsil (stack-trace + breadcrumbs) ko'rinadi. Imzo (signature) bo'yicha
guruhlanadi.

Revision ID: e033_crash_reports
Revises: e032_sync_schema
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa


revision = "e033_crash_reports"
down_revision = "e032_sync_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crash_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("signature", sa.String(64), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False, server_default=""),
        sa.Column("fatal", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("error_type", sa.String(200), nullable=False, server_default=""),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("stack_trace", sa.Text(), nullable=False, server_default=""),
        sa.Column("screen", sa.String(120), nullable=False, server_default=""),
        sa.Column("app_version", sa.String(40), nullable=False, server_default=""),
        sa.Column("os_version", sa.String(60), nullable=False, server_default=""),
        sa.Column("device_model", sa.String(120), nullable=False, server_default=""),
        sa.Column("breadcrumbs", sa.JSON(), nullable=True),
        sa.Column("affected_versions", sa.JSON(), nullable=True),
        sa.Column("occurrences", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_crash_reports_signature", "crash_reports", ["signature"], unique=True)
    op.create_index("ix_crash_reports_last_seen", "crash_reports", ["last_seen"])
    op.create_index("ix_crash_reports_resolved", "crash_reports", ["resolved"])


def downgrade() -> None:
    op.drop_index("ix_crash_reports_resolved", table_name="crash_reports")
    op.drop_index("ix_crash_reports_last_seen", table_name="crash_reports")
    op.drop_index("ix_crash_reports_signature", table_name="crash_reports")
    op.drop_table("crash_reports")
