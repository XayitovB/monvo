"""
alembic/versions/c3e8f2a1b004_add_password_reset_and_email_templates.py

Yangi jadvallar:
  - password_reset_tokens  (OTP kodlari)
  - email_templates        (admin panel orqali tahrirlash uchun)

+ Default 'forgot_password' email shabloni seed qilinadi
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3e8f2a1b004'
down_revision: Union[str, None] = 'b12f4a9e8c01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_HTML = """<!DOCTYPE html>
<html lang="uz"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="background:#1e293b;border-radius:24px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#064e3b,#059669,#10b981);padding:40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;">💰 Loyalty</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Smart Finance Assistant</p>
  </td></tr>
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;">Parolni tiklash</h2>
    <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
      {{ user_name }}, parolni tiklash uchun quyidagi <strong style="color:#10b981;">6 xonali kodni</strong>
      ilovangizga kiriting. Kod <strong style="color:#f59e0b;">15 daqiqa</strong> amal qiladi.
    </p>
    <div style="background:#0f172a;border:2px solid #10b981;border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Tasdiqlash kodi</p>
      <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#10b981;font-family:'Courier New',monospace;">{{ code }}</div>
    </div>
    <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;line-height:1.6;">
      Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.
    </p>
    <div style="border-top:1px solid #334155;padding-top:20px;">
      <p style="margin:0;color:#475569;font-size:12px;text-align:center;">© 2025 Loyalty · Ushbu xabar avtomatik yuborildi</p>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


def upgrade() -> None:
    # password_reset_tokens jadvali
    op.create_table(
        'password_reset_tokens',
        sa.Column('id',         sa.Integer(),                  primary_key=True),
        sa.Column('user_id',    sa.Integer(),                  nullable=False),
        sa.Column('code',       sa.String(6),                  nullable=False),
        sa.Column('token',      sa.String(64),                 nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(timezone=True),    nullable=False),
        sa.Column('used',       sa.Boolean(),                  default=False),
        sa.Column('created_at', sa.DateTime(timezone=True),    nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('token', name='uq_reset_token'),
    )
    op.create_index('ix_reset_token_user',  'password_reset_tokens', ['user_id'])
    op.create_index('ix_reset_token_token', 'password_reset_tokens', ['token'])

    # email_templates jadvali
    op.create_table(
        'email_templates',
        sa.Column('id',         sa.Integer(),                  primary_key=True),
        sa.Column('key',        sa.String(50),                 nullable=False, unique=True),
        sa.Column('subject',    sa.String(200),                nullable=False),
        sa.Column('body_html',  sa.Text(),                     nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),    nullable=True),
        sa.Column('updated_by', sa.String(100),                nullable=True),
    )

    # Default shablon seed qilish
    op.execute(
        sa.text(
            "INSERT INTO email_templates (key, subject, body_html, updated_by) "
            "VALUES (:key, :subject, :body_html, :updated_by) "
            "ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            key='forgot_password',
            subject='Loyalty — Parolni tiklash kodi',
            body_html=DEFAULT_HTML,
            updated_by='system',
        )
    )


def downgrade() -> None:
    op.drop_index('ix_reset_token_token', table_name='password_reset_tokens')
    op.drop_index('ix_reset_token_user',  table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
    op.drop_table('email_templates')
