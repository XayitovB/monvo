"""Phone OTP auth: add phone to users, create phone_otps table

Revision ID: e001_phone_auth
Revises: d001_kartly_loyalty
Create Date: 2026-04-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e001_phone_auth"
down_revision = "d001_kartly_loyalty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.phone column qo'shish
    op.add_column(
        "users",
        sa.Column("phone", sa.String(20), nullable=True),
    )
    op.create_index("ix_user_phone", "users", ["phone"], unique=True)

    # users.email ni nullable qilish (phone auth uchun email shart emas)
    op.alter_column("users", "email", existing_type=sa.String(100),
                    nullable=True, existing_nullable=False)

    # phone_otps jadvali yaratish
    op.create_table(
        "phone_otps",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_phone_otp_phone", "phone_otps", ["phone"])


def downgrade() -> None:
    op.drop_index("ix_phone_otp_phone", table_name="phone_otps")
    op.drop_table("phone_otps")
    op.drop_index("ix_user_phone", table_name="users")
    op.drop_column("users", "phone")
    op.alter_column("users", "email", existing_type=sa.String(100),
                    nullable=False, existing_nullable=True)
