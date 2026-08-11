"""
core/email_service.py
─────────────────────
Async email yuborish xizmati (aiosmtplib + Jinja2 HTML shablon)
"""
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Template
from loguru import logger

from config import settings

# ── Default Forgot Password HTML Shablon ─────────────────────────────────────
DEFAULT_FORGOT_PASSWORD_SUBJECT = "Monvo — Parolni tiklash kodi"

DEFAULT_FORGOT_PASSWORD_HTML = """
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parolni tiklash</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#1e293b;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b 0%,#059669 50%,#10b981 100%);
                        padding:40px 40px 30px;text-align:center;">
              <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);
                          border-radius:18px;margin:0 auto 16px;display:flex;
                          align-items:center;justify-content:center;">
                <span style="font-size:32px;">💰</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
                Monvo
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
                Smart Finance Assistant
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:700;">
                Parolni tiklash
              </h2>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                {{ user_name }}, parolni tiklash uchun quyidagi <strong style="color:#10b981;">6 xonali kodni</strong>
                ilovangizga kiriting. Kod <strong style="color:#f59e0b;">15 daqiqa</strong> amal qiladi.
              </p>

              <!-- OTP Code Box -->
              <div style="background:#0f172a;border:2px solid #10b981;border-radius:16px;
                          padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:600;
                           letter-spacing:2px;text-transform:uppercase;">
                  Tasdiqlash kodi
                </p>
                <div style="font-size:42px;font-weight:900;letter-spacing:12px;
                            color:#10b981;font-family:'Courier New',monospace;">
                  {{ code }}
                </div>
              </div>

              <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;line-height:1.6;">
                Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.
                Hisobingiz xavfsiz.
              </p>

              <div style="border-top:1px solid #334155;padding-top:20px;margin-top:8px;">
                <p style="margin:0;color:#475569;font-size:12px;text-align:center;">
                  © 2026 Monvo · Ushbu xabar avtomatik yuborildi
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def generate_otp() -> str:
    """Kriptografik xavfsiz 6 xonali OTP kodi yaratadi."""
    return "".join(random.choices(string.digits, k=6))


def generate_reset_token() -> str:
    """Unikal 64 belgili reset token yaratadi."""
    return uuid.uuid4().hex + uuid.uuid4().hex


def get_token_expiry() -> datetime:
    """15 daqiqa amal qiladigan muddatni qaytaradi."""
    return datetime.now(timezone.utc) + timedelta(minutes=15)


# ── Login alert (yangi qurilma) ─────────────────────────────────────────────
LOGIN_ALERT_HTML = """
<!DOCTYPE html>
<html lang="uz">
<head><meta charset="UTF-8"><title>Yangi qurilmadan kirish</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Inter',Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
      <div style="font-size:13px;letter-spacing:.6px;color:#94a3b8;text-transform:uppercase;margin-bottom:8px;">Monvo · Xavfsizlik</div>
      <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin:0 0 16px;">⚠️ Yangi qurilmadan kirish</h1>
      <p style="font-size:15px;line-height:1.6;color:#cbd5e1;margin:0 0 24px;">
        Monvo hisobingizga (<strong>{{ identifier }}</strong>) yangi qurilma yoki IP manzildan kirildi.
        Agar bu siz bo'lsangiz, e'tibor bermang.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#cbd5e1;">
        <tr><td style="padding:8px 0;width:40%;color:#94a3b8;">Vaqti:</td><td>{{ when }}</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;">Rol:</td><td>{{ role }}</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;">IP manzil:</td><td><code>{{ ip }}</code></td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;vertical-align:top;">Qurilma:</td><td style="word-break:break-all;font-size:12.5px;">{{ user_agent }}</td></tr>
      </table>
      <div style="margin:28px 0 0;padding:16px;background:#0f172a;border-radius:10px;border:1px solid #334155;">
        <strong style="color:#fca5a5;">Bu siz bo'lmasangiz:</strong>
        <ol style="margin:10px 0 0 18px;padding:0;color:#cbd5e1;font-size:13.5px;line-height:1.6;">
          <li>Darhol parolni o'zgartiring</li>
          <li>Boshqa qurilmalardan chiqing</li>
          <li>support@monvo.uz ga xabar bering</li>
        </ol>
      </div>
    </div>
    <div style="text-align:center;font-size:11.5px;color:#64748b;margin-top:20px;">
      © Monvo · Bu xabar avtomatik yuborilgan
    </div>
  </div>
</body>
</html>
"""


async def send_login_alert_email(
    *,
    to_email: str,
    identifier: str,
    role: str,
    ip: str,
    user_agent: str,
    when: datetime,
) -> bool:
    """Yangi qurilmadan login bo'lganda foydalanuvchiga ogohlantirish.

    `to_email` bir nechta manzil bo'lsa vergul bilan ajratilgan ham bo'lishi mumkin
    (admin uchun multi-recipient).
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        return False
    recipients = [e.strip() for e in to_email.split(",") if e.strip()]
    if not recipients:
        return False

    html_body = Template(LOGIN_ALERT_HTML).render(
        identifier=identifier,
        role=role,
        ip=ip or "—",
        user_agent=user_agent or "—",
        when=when.strftime("%Y-%m-%d %H:%M:%S UTC"),
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Monvo — Yangi qurilmadan kirish"
    msg["From"]    = f"Monvo Security <{settings.SMTP_USER}>"
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname  = settings.SMTP_HOST,
            port      = settings.SMTP_PORT,
            username  = settings.SMTP_USER,
            password  = settings.SMTP_PASSWORD,
            use_tls   = settings.SMTP_TLS,
            start_tls = settings.SMTP_STARTTLS,
        )
        logger.info(f"Login alert email yuborildi: {recipients} ({role})")
        return True
    except Exception as e:
        logger.warning(
            f"Login alert email xato [{recipients}] ({type(e).__name__}): {e}"
        )
        return False


async def send_reset_email(
    to_email: str,
    user_name: str,
    code: str,
    subject: str | None = None,
    html_template: str | None = None,
) -> bool:
    """
    Parolni tiklash emailini yuboradi.

    Returns:
        True — muvaffaqiyatli
        False — SMTP xatosi yoki sozlamalar yo'q
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("SMTP sozlanmagan — email yuborilmadi (SMTP_HOST / SMTP_USER yo'q)")
        return False

    # Jinja2 shablon render
    tmpl = html_template or DEFAULT_FORGOT_PASSWORD_HTML
    html_body = Template(tmpl).render(user_name=user_name, code=code)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject or DEFAULT_FORGOT_PASSWORD_SUBJECT
    msg["From"]    = f"Monvo <{settings.SMTP_USER}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname  = settings.SMTP_HOST,
            port      = settings.SMTP_PORT,
            username  = settings.SMTP_USER,
            password  = settings.SMTP_PASSWORD,
            use_tls   = settings.SMTP_TLS,
            start_tls = settings.SMTP_STARTTLS,
        )
        logger.info(f"Reset email yuborildi: {to_email}")
        return True
    except Exception as e:
        # FIX #14: xato turi ham logga yoziladi — noto'g'ri port yoki TLS konfigini aniqlash uchun
        logger.error(
            f"SMTP xatosi [{to_email}] ({type(e).__name__}): {e} "
            f"| host={settings.SMTP_HOST}:{settings.SMTP_PORT} "
            f"tls={settings.SMTP_TLS} starttls={settings.SMTP_STARTTLS}"
        )
        return False
