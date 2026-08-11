"""Add merchant_branches.photos JSONB column for gallery.

Revision ID: e015_branch_photos
Revises: e014_logo_url_to_text
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e015_branch_photos"
down_revision = "e014_logo_url_to_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE merchant_branches "
        "ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE merchant_branches DROP COLUMN IF EXISTS photos")
