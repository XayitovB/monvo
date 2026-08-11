from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/monvo"
    SECRET_KEY: str = "monvo-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 129600  # 90 kun (qayta login = qayta SMS, shuning uchun uzaytirildi)

    # ── Data-at-rest encryption ───────────────────────────────────────────────
    # POS kredensiallari kabi maxfiy JSON'larni bazada shifrlash uchun Fernet
    # kaliti. Bo'sh bo'lsa shifrlash o'chiriladi (passthrough). Kalit yaratish:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = ""

    # ── Muhit (Environment) ───────────────────────────────────────────────────
    # development | production
    APP_ENV: str = "development"

    # ── Google OAuth2 ─────────────────────────────────────────────────────────
    # Google Cloud Console → APIs & Services → Credentials → Web Client ID
    GOOGLE_CLIENT_ID: str = "584058790525-9824b2l0cfj4do4h7b18b7ama969kggh.apps.googleusercontent.com"

    # ── Admin Panel ───────────────────────────────────────────────────────────
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    ADMIN_SECRET_KEY: str = "admin-secret-key-change-in-production"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Vergul bilan ajratilgan ro'yxat. Production da `.env`da quyidagicha:
    #   ALLOWED_ORIGINS="https://monvo.uz,https://app.monvo.uz"
    # Default qiymat — faqat localhost/dev origin'lari uchun. "*" hech qachon
    # default emas: Flutter ilova `Authorization` header bilan keladi va
    # browser CORS preflight'i `*` + credentials birgalikda ishlamaydi.
    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,"      # Vite dev (frontend)
        "http://127.0.0.1:5173,"
        "http://localhost:3000,"      # CRA dev
        "http://localhost:8181,"      # FastAPI dev
        "http://localhost:8081,"      # Flutter web dev
        "capacitor://localhost,"      # Capacitor (Apple Wallet)
        "ionic://localhost"
    )

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60        # Umumiy endpointlar uchun
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10   # Login/register uchun qattiqroq

    # ── Redis (Rate Limit + Cache) ────────────────────────────────────────────
    # Redis ishlatilsa rate limit server restart bo'lganda ham saqlanadi
    # Bo'sh qoldirilsa — in-memory ishlatiladi (development uchun)
    REDIS_URL: str = ""  # masalan: "redis://localhost:6379/0"

    # ── Monitoring ────────────────────────────────────────────────────────────
    # Sentry: https://sentry.io → New Project → FastAPI → DSN olish
    SENTRY_DSN: str = ""  # masalan: "https://xxx@o123.ingest.sentry.io/456"

    # GlitchTip (bepul, open-source, o'z serverda)
    # 1. errors.monvo.uz ga kirib ro'yxatdan o'ting
    # 2. Settings → API Tokens → Token yarating
    # 3. Settings → Projects → Project slug olish
    GLITCHTIP_URL: str = "https://errors.monvo.uz"
    GLITCHTIP_TOKEN: str = ""   # GlitchTip API token

    # ── Firebase FCM ─────────────────────────────────────────────────────────
    # Firebase Console → Project Settings → Service Accounts → JSON fayl yo'li
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""  # masalan: "firebase-adminsdk.json"

    # ── Telegram Bot ─────────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""  # @BotFather dan olingan token (customer bot)
    TELEGRAM_BOT_ENABLED: bool = True  # False bo'lsa webhook o'chiriladi (bot javob bermaydi). Token saqlanadi.
    FRONTEND_URL: str = ""        # Frontend URL (mini app uchun), masalan: https://monvo.up.railway.app

    # ── Ilova yangilanish modali (update prompt) ──────────────────────────────
    # latest_build = store'dagi eng so'nggi build raqami. Qurilma buildi undan
    # past bo'lsa — "yangilang" modali chiqadi. min_build dan past bo'lsa —
    # majburiy (yopib bo'lmaydigan) modal. 0 = o'chiq (prompt chiqmaydi).
    # Store'da yangi versiya JONLI bo'lganda latest_build ni o'sha raqamga qo'ying.
    UPDATE_LATEST_BUILD_IOS: int = 0
    UPDATE_MIN_BUILD_IOS: int = 0
    UPDATE_LATEST_BUILD_ANDROID: int = 0
    UPDATE_MIN_BUILD_ANDROID: int = 0
    UPDATE_STORE_URL_IOS: str = "https://apps.apple.com/app/monvo/id6781256822"
    UPDATE_STORE_URL_ANDROID: str = "https://play.google.com/store/apps/details?id=uz.monvo.app"
    # Merchant ilova (Monvo Business — uz.monvo.app.business) store URL'lari.
    UPDATE_STORE_URL_IOS_MERCHANT: str = "https://apps.apple.com/app/monvo-business/id6749947483"
    UPDATE_STORE_URL_ANDROID_MERCHANT: str = "https://play.google.com/store/apps/details?id=uz.monvo.app.business"

    # Merchant bot (@Monvo_business_bot) — /m Mini App uchun stateless webhook
    MERCHANT_BOT_TOKEN: str = ""
    MERCHANT_BOT_WEBHOOK_SECRET: str = ""  # Telegram secret_token header tekshiruvi

    # ── SMTP (Email yuborish) ─────────────────────────────────────────────────
    # Gmail: smtp.gmail.com:587 (App Password kerak — 2FA yoqilgan bo'lsin)
    # Yandex: smtp.yandex.com:587
    # Mail.ru: smtp.mail.ru:465 (SMTP_TLS=true, SMTP_STARTTLS=false)
    SMTP_HOST:     str  = ""     # bo'sh = email o'chirilgan (dev da log ga yoziladi)
    SMTP_PORT:     int  = 587
    SMTP_USER:     str  = ""     # info@monvo.uz
    SMTP_PASSWORD: str  = ""
    SMTP_TLS:      bool = False   # SSL/TLS — 465 port uchun True
    SMTP_STARTTLS: bool = True    # STARTTLS — 587 port uchun True

    # ── Eskiz.uz (SMS) ────────────────────────────────────────────────────────
    ESKIZ_EMAIL:    str = ""
    ESKIZ_PASSWORD: str = ""
    ESKIZ_FROM:     str = "4546"
    SMS_PRICE_UZS:  int = 50   # 1 SMS bo'lagi narxi (merchant rassilka uchun)

    # ── Payme (Paycom) — merchantlar Monvo'ga obuna to'lovi uchun ────────────
    # 1. https://merchant.paycom.uz da hisob ochiladi
    # 2. "Yangi kassa qo'shish" → JSON-RPC integratsiya
    # 3. Endpoint: https://monvo.uz/payme/merchant
    # 4. KEY (API kalit) — JSON-RPC HTTP Basic auth uchun ("Paycom:<KEY>" Base64)
    # 5. Test va production hisoblar alohida — TEST_KEY ham qo'llab-quvvatlanadi
    PAYME_MERCHANT_ID: str = ""
    PAYME_KEY:         str = ""
    PAYME_TEST_KEY:    str = ""
    PAYME_CHECKOUT_URL: str = "https://checkout.paycom.uz"
    # Min/Max to'lov summasi (so'm) — server-side validatsiya, Payme ham tekshiradi
    PAYME_MIN_AMOUNT: int = 1000
    PAYME_MAX_AMOUNT: int = 100_000_000

    # ── GigaChat (Sber) — landing page AI chat vidjeti ────────────────────────
    # 1. https://developers.sber.ru/studio/workspaces → GigaChat API → Ilova yarating
    # 2. "Авторизационные данные" (Client ID:Client Secret) ni Base64'da oling —
    #    bu qiymat to'g'ridan-to'g'ri GIGACHAT_AUTH_KEY bo'ladi
    # 3. Bo'sh bo'lsa — chat vidjeti UI'da ko'rinadi, lekin javob o'rniga
    #    "sozlanmagan" degan xabar qaytaradi (backend qulamaydi)
    GIGACHAT_AUTH_KEY: str = ""
    GIGACHAT_SCOPE: str = "GIGACHAT_API_PERS"
    # Sber sertifikatlari (Mintsifry CA) standart trust store'da yo'q. Server
    # ushbu CA'ni o'rnatgan bo'lsa True qoldiring; aks holda vaqtincha False
    # qiling (TLS tekshiruvi o'chadi — faqat ishonchli tarmoqda ishlating).
    GIGACHAT_VERIFY_SSL: bool = True
    GIGACHAT_SYSTEM_PROMPT: str = (
        "Siz Monvo — O'zbekistondagi QR loyalty-kartalar platformasi — uchun "
        "maxsus yaratilgan yordamchisiz. Siz FAQAT Monvo haqidagi savollarga "
        "(loyalty kartalar, ballar, mukofotlar, ilova, ro'yxatdan o'tish, "
        "biznes uchun tariflar va h.k.) javob berasiz. Agar savol Monvo bilan "
        "bog'liq bo'lmasa, buni muloyimlik bilan ayting va faqat Monvo "
        "mavzusida yordam bera olishingizni tushuntiring — boshqa mavzuda "
        "javob bermang.\n\n"
        "Siz FAQAT ikki tilda — o'zbek va rus tillarida — gaplashasiz. "
        "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering (agar "
        "boshqa tilda yozsa, o'zbek yoki rus tiliga o'tishni so'rang).\n\n"
        "Muhim kontekst: hozirda Monvo mobil ilovalari (mijoz va biznes "
        "ilovalari) Google Play va App Store'da ko'rib chiqilmoqda "
        "(tasdiqlanishi kutilmoqda) va hali u yerlarda mavjud emas. "
        "Foydalanuvchi ilovani so'rasa yoki qayerdan yuklab olish haqida "
        "so'rasa — hozircha Telegram bot orqali foydalanish mumkinligini "
        "ayting: @monvouz_bot. Mobil ilovalar tez orada do'konlarda "
        "chiqishini qo'shib qo'ying.\n\n"
        "Qisqa, aniq va do'stona javob bering."
    )

    # ── Prometheus Metrics ────────────────────────────────────────────────────
    # Bo'sh bo'lsa — /metrics hamma uchun ochiq (faqat dev uchun).
    # Production da Railway env: METRICS_TOKEN=uzun-tasodifiy-token
    # So'rov: GET /metrics  Authorization: Bearer <token>
    METRICS_TOKEN: str = ""

    # ── Brute-force himoyasi ──────────────────────────────────────────────────
    # Yangi qurilmadan login bo'lganda admin'ga yuboriladigan email manzil.
    # Bo'sh bo'lsa — `SMTP_USER` ishlatiladi. Ko'p admin uchun vergul bilan ajrating.
    ADMIN_ALERT_EMAIL: str = ""

    # ── App Store / Play Store tekshiruv akkaunti ──────────────────────────────
    # Reviewer haqiqiy SMS ololmaydi — shu bitta raqam uchun belgilangan
    # kodni qabul qilamiz. Bo'sh bo'lsa (default) — o'chirilgan, hech qanday
    # raqamga bypass ishlamaydi. Faqat shu ANIQ raqam + ANIQ kod moslashsa ishlaydi.
    REVIEW_PHONE_NUMBER: str = ""
    REVIEW_OTP_CODE: str = ""


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


_UNSAFE_DEFAULTS = {
    "SECRET_KEY": "monvo-super-secret-key-change-in-production",
    "ADMIN_SECRET_KEY": "admin-secret-key-change-in-production",
    "ADMIN_PASSWORD": "admin",
    "ADMIN_USERNAME": "admin",
}


def _validate_production(s: "Settings") -> None:
    if s.APP_ENV.lower() != "production":
        return
    errors: list[str] = []
    for field, unsafe in _UNSAFE_DEFAULTS.items():
        if getattr(s, field) == unsafe:
            errors.append(f"{field} is using the insecure default value")
    if not s.GOOGLE_CLIENT_ID or "584058790525" in s.GOOGLE_CLIENT_ID:
        errors.append("GOOGLE_CLIENT_ID must be set via env (the hardcoded default is compromised)")
    # CORS — production da localhost yoki "*" qabul qilinmaydi
    origins_raw = (s.ALLOWED_ORIGINS or "").strip()
    if origins_raw == "*" or "localhost" in origins_raw or "127.0.0.1" in origins_raw:
        errors.append(
            "ALLOWED_ORIGINS must list explicit production domains "
            '(e.g. "https://monvo.uz,https://app.monvo.uz") — '
            'the dev default and "*" are both rejected in production'
        )
    if not origins_raw or not all(
        o.strip().startswith(("https://", "http://"))
        for o in origins_raw.split(",")
        if o.strip()
    ):
        errors.append("ALLOWED_ORIGINS entries must each start with http:// or https://")
    if errors:
        raise RuntimeError(
            "Insecure configuration in APP_ENV=production:\n  - "
            + "\n  - ".join(errors)
            + "\nSet these via environment variables before starting."
        )


def _warn_production(s: "Settings") -> None:
    """Operatsion sozlamalar yo'qligida ogohlantirish (deploy'ni to'xtatmaydi).

    Bular xavfsizlik xatosi emas, lekin prod'da bo'lmasa servis degraded ishlaydi:
    - PAYME yo'q → obuna to'lovi ishlamaydi
    - ESKIZ yo'q → OTP/SMS rassilka logga yoziladi, yuborilmaydi
    - FIREBASE yo'q → push xabar ketmaydi
    - METRICS_TOKEN bo'sh → /metrics hammaga ochiq
    """
    if s.APP_ENV.lower() != "production":
        return
    import sys
    warnings: list[str] = []
    if not s.PAYME_MERCHANT_ID or not s.PAYME_KEY:
        warnings.append("PAYME_MERCHANT_ID/PAYME_KEY o'rnatilmagan — obuna to'lovi ishlamaydi")
    if not s.ESKIZ_EMAIL or not s.ESKIZ_PASSWORD:
        warnings.append("ESKIZ_EMAIL/ESKIZ_PASSWORD o'rnatilmagan — OTP/SMS yuborilmaydi (faqat logga)")
    if not s.FIREBASE_SERVICE_ACCOUNT_JSON:
        warnings.append("FIREBASE_SERVICE_ACCOUNT_JSON o'rnatilmagan — push xabar ketmaydi")
    if not s.METRICS_TOKEN:
        warnings.append("METRICS_TOKEN bo'sh — /metrics endpoint hammaga ochiq")
    if not s.ENCRYPTION_KEY:
        warnings.append("ENCRYPTION_KEY bo'sh — POS kredensiallari bazada ochiq saqlanadi")
    if not s.GIGACHAT_AUTH_KEY:
        warnings.append("GIGACHAT_AUTH_KEY o'rnatilmagan — landing chat vidjeti javob bermaydi")
    for w in warnings:
        print(f"⚠️  CONFIG WARNING: {w}", file=sys.stderr)


settings = Settings()
_validate_production(settings)
_warn_production(settings)

