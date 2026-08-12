"""
main.py
────────
Monvo — B2B loyalty platformasi API.

Tarkibi:
  - FastAPI app, CORS, rate limiting, Sentry
  - Lifespan: DB init (dev = create_all, prod = alembic)
  - Routerlar: auth (customer), merchants, cards, rewards, transactions,
    push, admin, password_reset, app_links, traffic, waitlist
  - Static: /panel (merchant/admin panel), / (landing)
"""
import os
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
from loguru import logger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from config import settings
from core.fcm import init_firebase
from database import AsyncSessionLocal, Base, engine, get_db

# ── Logging ──────────────────────────────────────────────────────────────────
logger.remove()
_log_level = os.getenv(
    "LOG_LEVEL",
    "DEBUG" if settings.APP_ENV == "development" else "INFO",
).upper()
logger.add(
    sys.stdout,
    colorize=True,
    format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | <cyan>{function}</cyan> - <level>{message}</level>",
    level=_log_level,
)

# ── Rate Limiter ─────────────────────────────────────────────────────────────
_redis_url = settings.REDIS_URL if settings.REDIS_URL else None
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
    storage_uri=_redis_url,
)
if _redis_url:
    logger.success(f"✅ Rate Limiter: Redis ({_redis_url})")
else:
    logger.warning("⚠️  Rate Limiter: RAM. Production uchun REDIS_URL sozlang!")

# ── Sentry ───────────────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    _trace_rate = float(os.getenv("SENTRY_TRACE_RATE", "0.05"))
    _prof_rate = float(os.getenv("SENTRY_PROFILE_RATE", "0.02"))
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=_trace_rate,
        profiles_sample_rate=_prof_rate,
        environment=settings.APP_ENV,
        release="monvo@1.0.0",
        send_default_pii=False,
    )
    logger.success(f"✅ Sentry: {settings.SENTRY_DSN[:40]}...")
else:
    logger.warning("⚠️  Sentry DSN sozlanmagan")


# ── Stale connection cleanup (opens a direct asyncpg connection, not pool) ──
async def _cleanup_stale_connections() -> None:
    """Kill our own idle Postgres backends left by crashed deploys.

    Uses a single short-lived direct connection so we don't depend on the
    SQLAlchemy pool (which may itself be starved). Safe because we only
    touch connections owned by `current_user` and idle for >30s.
    """
    try:
        import asyncpg
    except ImportError:
        return
    url = settings.DATABASE_URL
    # asyncpg expects a plain libpq-style URL, not SQLAlchemy's dialect prefix.
    for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
        if url.startswith(prefix):
            url = "postgresql://" + url[len(prefix):]
            break

    conn = None
    for attempt in range(3):
        try:
            conn = await asyncpg.connect(url, timeout=5)
            break
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"cleanup connect attempt {attempt + 1} failed: {exc}")
            import asyncio
            await asyncio.sleep(1 + attempt)

    if conn is None:
        logger.warning("stale-connection cleanup skipped — could not get a direct connection")
        return
    try:
        killed = await conn.fetch("""
            SELECT pg_terminate_backend(pid) AS ok
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND usename = current_user
              AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
              AND state_change < NOW() - INTERVAL '30 seconds'
        """)
        logger.info(f"startup: terminated {len(killed)} stale DB connections")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"stale cleanup query failed: {exc}")
    finally:
        try:
            await conn.close()
        except Exception:  # noqa: BLE001
            pass


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Deploy-window hardening: reclaim slots from previously crashed workers
    # before the pool opens its own connections.
    await _cleanup_stale_connections()

    if settings.APP_ENV == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.success("✅ [DEV] Database tables created/verified")
    else:
        logger.info("ℹ️  [PROD] DB boshqaruvi Alembic migratsiyasi orqali")

    # Eskidan qolgan ~30 ta inline ALTER TABLE / CREATE TABLE statement bor edi —
    # endi `e021_consolidate_inline_migrations` versiyasiga ko'chirildi va
    # start.sh ichida `alembic upgrade head` orqali ishlaydi.
    # Eslatma: agar Alembic biror sababga ko'ra ishlamasa, endpoint'lar
    # yangi ustunlarsiz xato beradi — Sentry bunday holatda darhol xabar
    # beradi va `start.sh` migratsiya qadami yiqilsa konteyner restart qiladi.

    # users.region ustunlari — idempotent ensure (Alembic ishlamay qolsa ham xavfsiz).
    try:
        from sqlalchemy import text as _txt
        async with AsyncSessionLocal() as _db:
            await _db.execute(_txt(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS region VARCHAR(40) NOT NULL DEFAULT ''"))
            await _db.execute(_txt(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS region_updated_at TIMESTAMPTZ"))
            # user_notifications — professional push maydonlari
            for _col in (
                "category VARCHAR(20) NOT NULL DEFAULT 'info'",
                "image_url TEXT NOT NULL DEFAULT ''",
                "route VARCHAR(40) NOT NULL DEFAULT ''",
                "route_id VARCHAR(120) NOT NULL DEFAULT ''",
                "campaign_id INTEGER",
            ):
                await _db.execute(_txt(
                    f"ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS {_col}"))
            # Loyalty modeli (cashback | stamp) — merchants + cards
            await _db.execute(_txt(
                "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS loyalty_type VARCHAR(16) NOT NULL DEFAULT 'cashback'"))
            await _db.execute(_txt(
                "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stamp_threshold INTEGER NOT NULL DEFAULT 7"))
            await _db.execute(_txt(
                "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stamp_reward_title VARCHAR(120) NOT NULL DEFAULT 'Bepul mahsulot'"))
            await _db.execute(_txt(
                "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stamp_icon VARCHAR(24) NOT NULL DEFAULT 'coffee'"))
            await _db.execute(_txt(
                "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS spend_goal INTEGER NOT NULL DEFAULT 1000000"))
            await _db.execute(_txt(
                "ALTER TABLE cards ADD COLUMN IF NOT EXISTS stamp_count INTEGER NOT NULL DEFAULT 0"))
            await _db.execute(_txt(
                "ALTER TABLE cards ADD COLUMN IF NOT EXISTS spend_progress INTEGER NOT NULL DEFAULT 0"))
            # Ilova yangilanish modali sozlamalari (admin panel boshqaradi)
            for _c in ("update_latest_build_ios", "update_min_build_ios",
                       "update_latest_build_android", "update_min_build_android",
                       "merchant_update_latest_build_ios", "merchant_update_min_build_ios",
                       "merchant_update_latest_build_android", "merchant_update_min_build_android"):
                await _db.execute(_txt(
                    f"ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS {_c} INTEGER NOT NULL DEFAULT 0"))
            await _db.commit()
    except Exception as _e:
        logger.warning(f"users.region ensure skip: {_e}")

    init_firebase()
    from core.scheduler import start_scheduler, stop_scheduler
    from routers.telegram_bot import bot_init, bot_set_webhook, bot_delete_webhook, bot_shutdown
    from core import leader

    # Bot instance HAR worker'da kerak (webhook istalgan worker'ga tushadi).
    await bot_init()

    # Cron job'lar (kunlik push, backup, webhook retry) + webhook o'rnatish —
    # FAQAT bitta worker'da (leader). Aks holda har push N marta yuboriladi.
    async def _on_become_leader():
        start_scheduler()
        if settings.TELEGRAM_BOT_ENABLED:
            await bot_set_webhook(settings.FRONTEND_URL or "")
            logger.success("👑 Leader worker: scheduler + webhook faol")
        else:
            await bot_delete_webhook()
            logger.success("👑 Leader worker: scheduler faol (Telegram bot DISABLE)")

    await leader.start(_on_become_leader)

    yield
    await leader.stop()
    await bot_shutdown()
    stop_scheduler()
    await engine.dispose()
    logger.info("🔌 Database connections closed")


# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="💳 Monvo Loyalty API",
    description="""
## Monvo — QR loyalty karta platformasi

Biznes uchun B2B loyalty: mijozlarga QR kartalar chiqaring, har xarid uchun
ball bering, ballarni mukofotlarga almashtiring.

### Autentifikatsiya
| Guruh | Token |
|-------|-------|
| 🏪 **Merchants** | `Authorization: Bearer <merchant JWT>` (`/merchants/login`) |
| 👤 **Customers** | `Authorization: Bearer <user JWT>` (`/auth/login`) |
| 🔧 **Admin**    | `Authorization: Bearer <admin JWT>` (`/admin/login`) |

### Endpoint guruhlari
| Guruh | Vazifasi |
|-------|----------|
| 🔐 Auth         | User register / login / Google / profile |
| 🏪 Merchants    | Biznes ro'yxat / login / profil / KPI |
| 💳 Cards        | Karta yaratish (QR), ro'yxat, ko'rish, bloklash |
| 🎁 Rewards      | Reward katalogi + ball to'plash qoidalari |
| 🔄 Transactions | QR scan (earn), reward (redeem), tarix |
| 🔔 Push         | Firebase FCM token boshqaruvi |
| 🔧 Admin        | Platforma super-admin |

---

> **Base URL:** `https://monvo.uz` &nbsp;|&nbsp; **Version:** 1.0.1
""",
    version="1.0.1",
    contact={"name": "Monvo Team", "email": "support@monvo.uz", "url": "https://monvo.uz"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_ENV.lower() == "development" else None,
    redoc_url="/redoc" if settings.APP_ENV.lower() == "development" else None,
    openapi_url="/openapi.json" if settings.APP_ENV.lower() == "development" else None,
    swagger_ui_parameters={
        "docExpansion": "none",
        "defaultModelsExpandDepth": 0,
        "displayRequestDuration": True,
        "filter": True,
        "syntaxHighlight.theme": "monokai",
    },
)

# ── Prometheus ───────────────────────────────────────────────────────────────
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/health", "/metrics"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.success("✅ Prometheus: /metrics endpoint faol")
except ImportError:
    logger.warning("⚠️  prometheus-fastapi-instrumentator o‘rnatilmagan")

# ── Metrics Auth Middleware ───────────────────────────────────────────────────
if settings.METRICS_TOKEN:
    class _MetricsAuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.url.path == "/metrics":
                token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
                if token != settings.METRICS_TOKEN:
                    return Response(status_code=401, content="Unauthorized")
            return await call_next(request)
    app.add_middleware(_MetricsAuthMiddleware)
    logger.success("✅ /metrics endpoint himoyalangan (METRICS_TOKEN)")
else:
    logger.warning("⚠️  METRICS_TOKEN sozlanmagan — /metrics hamma uchun ochiq!")

# ── CORS ─────────────────────────────────────────────────────────────────────
# config.py da ALLOWED_ORIGINS — vergul bilan ajratilgan explicit ro'yxat.
# "*" hech qachon ishlatilmaydi: allow_credentials=True bilan birgalikda
# spec quirk tufayli browser bunday javobni rad etadi, va explicit ro'yxat
# Apple Wallet / Telegram WebApp sahifalarini kiritishni majbur qiladi.
_origins = [o.strip() for o in (settings.ALLOWED_ORIGINS or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    allow_credentials=True,
)
logger.info(f"CORS: {len(_origins)} origin{'s' if len(_origins) != 1 else ''} allowed")

# ── Rate Limiter ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# Apply `default_limits` globally to every route — without this middleware
# `Limiter(default_limits=...)` only affects routes decorated with @limiter.limit.
app.add_middleware(SlowAPIMiddleware)

# ── Compression ──────────────────────────────────────────────────────────────
# gzip for any response body >= 1 KiB (analytics/lists often 10-100 KiB).
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)

# ── Security headers ─────────────────────────────────────────────────────────
# Har bir javobga himoya header'lari qo'shadi. /tg (Telegram Mini App)
# Telegram domeni ichida iframe'da ochilgani uchun unga frame cheklovi
# qo'yilmaydi; qolgan hammasi SAMEORIGIN.
_IS_PROD = settings.APP_ENV.lower() == "production"


class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("Permissions-Policy", "geolocation=(self), camera=(self), microphone=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        # Telegram Mini App iframe'da ochiladi — unga frame-deny qo'ymaymiz.
        if not request.url.path.startswith("/tg"):
            h.setdefault("X-Frame-Options", "SAMEORIGIN")
        # HSTS — faqat production'da (HTTPS ortida). Dev'da http buzilmasin.
        if _IS_PROD:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


app.add_middleware(_SecurityHeadersMiddleware)
logger.info("Security headers middleware faol")

# ── Routers ──────────────────────────────────────────────────────────────────
from routers import telegram_auth as _tg_auth  # noqa: E402
from routers import telegram_bot as _tg_bot    # noqa: E402
from routers import (
    admin,
    admin_achievements,
    admin_games,
    ai_assistant,
    analytics,
    announcements,
    app_links,
    auth,
    billing,
    cards,
    contests,
    crash_reports,
    discover,
    experiments,
    games,
    gamification,
    landing_cms,
    loyalty,
    merchant_api,
    merchant_bot,
    merchant_tokens,
    merchant_webhooks,
    payme,
    merchant_analytics,
    merchant_crm,
    merchant_manage,
    merchants,
    notifications,
    password_reset,
    platform,
    pos_integrations,
    pos_webhooks,
    push,
    rewards,
    scheduled_push,
    session,
    support_chat,
    tariffs,
    traffic,
    transactions,
    waitlist,
    wishlist,
)

app.include_router(auth.router)
app.include_router(session.router)
app.include_router(_tg_auth.router)
app.include_router(_tg_bot.router)
app.include_router(password_reset.router)
app.include_router(merchants.router)
app.include_router(cards.router)
app.include_router(rewards.router)
app.include_router(transactions.router)
app.include_router(push.router)
app.include_router(admin.router)
app.include_router(tariffs.router)
app.include_router(app_links.router)
app.include_router(traffic.router)
app.include_router(waitlist.router)
app.include_router(scheduled_push.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(experiments.router)
app.include_router(experiments.public_router)
app.include_router(loyalty.router)
app.include_router(merchant_analytics.router)
app.include_router(merchant_crm.router)
app.include_router(merchant_manage.router)
app.include_router(pos_integrations.router)
app.include_router(pos_webhooks.router)
app.include_router(merchant_webhooks.router)
app.include_router(announcements.admin_router)
app.include_router(announcements.public_router)
app.include_router(billing.admin_router)
app.include_router(billing.merchant_router)
app.include_router(platform.router)
app.include_router(gamification.router)
app.include_router(contests.router)
app.include_router(contests.admin_router)
app.include_router(admin_achievements.router)
app.include_router(games.router)
app.include_router(admin_games.router)
app.include_router(admin_games.games_router)
app.include_router(wishlist.router)
app.include_router(discover.router)
app.include_router(landing_cms.router)
app.include_router(payme.router)
app.include_router(merchant_tokens.router)
app.include_router(merchant_api.router)
app.include_router(merchant_bot.router)
app.include_router(crash_reports.router)
app.include_router(support_chat.router)
app.include_router(ai_assistant.router)


# ── Public app settings (Flutter app fetches this on startup) ─────────────────
from fastapi import Response  # noqa: E402
from core.cache import cache_get, cache_set  # noqa: E402

_APP_CONFIG_CACHE_KEY = "app_config:v1"

# Eski inline migratsiyalar Alembic (e021) ga ko'chirilgan. Bu yerdagi ALTER'lar
# faqat zaxira (safety-net) — endi HAR so'rovda emas, jarayon davomida BIR MARTA
# ishlaydi (public, keng so'raladigan endpoint bo'lgani uchun og'ir edi).
_app_config_migrated = False


async def _ensure_app_config_columns(db) -> None:
    global _app_config_migrated
    if _app_config_migrated:
        return
    from sqlalchemy import text as _txt
    _migrations = [
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS gamification_enabled BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS payme_merchant_id VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS payme_key VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS payme_test_key VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS payme_test_mode BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS payme_checkout_url VARCHAR(200) NOT NULL DEFAULT 'https://checkout.paycom.uz'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(50) UNIQUE",
    ]
    for _sql in _migrations:
        try:
            await db.execute(_txt(_sql))
            await db.commit()
        except Exception:
            try:
                await db.rollback()
            except Exception:
                pass
    _app_config_migrated = True


@app.get("/app-config", tags=["📱 App Config"], summary="App sozlamalari (public)")
async def public_app_config(response: Response, db=Depends(get_db)):
    # Clients poll this on every cold-start — cache heavily.
    response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=300"
    hit = await cache_get(_APP_CONFIG_CACHE_KEY)
    if hit is not None:
        return hit

    from models import AppSettings
    from sqlalchemy import select as _sel
    await _ensure_app_config_columns(db)
    row = (await db.execute(_sel(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if not row:
        data = {
            "app_name": "Monvo",
            "logo_url": "",
            "primary_color": "#0B2545",
            "gamification_enabled": True,
        }
    else:
        data = {
            "app_name": row.app_name,
            "logo_url": row.logo_url,
            "primary_color": row.primary_color,
            "gamification_enabled": getattr(row, "gamification_enabled", True),
        }
    # Ilova yangilanish modali — build raqamlari DB'dan (admin panel boshqaradi),
    # store URL'lar config'dan.
    data["update"] = {
        "ios": {
            "latest_build": int(getattr(row, "update_latest_build_ios", 0) or 0) if row else 0,
            "min_build": int(getattr(row, "update_min_build_ios", 0) or 0) if row else 0,
            "store_url": settings.UPDATE_STORE_URL_IOS,
        },
        "android": {
            "latest_build": int(getattr(row, "update_latest_build_android", 0) or 0) if row else 0,
            "min_build": int(getattr(row, "update_min_build_android", 0) or 0) if row else 0,
            "store_url": settings.UPDATE_STORE_URL_ANDROID,
        },
    }
    # Merchant ilova (Monvo Business) — alohida build raqamlari + store URL.
    data["update_merchant"] = {
        "ios": {
            "latest_build": int(getattr(row, "merchant_update_latest_build_ios", 0) or 0) if row else 0,
            "min_build": int(getattr(row, "merchant_update_min_build_ios", 0) or 0) if row else 0,
            "store_url": settings.UPDATE_STORE_URL_IOS_MERCHANT,
        },
        "android": {
            "latest_build": int(getattr(row, "merchant_update_latest_build_android", 0) or 0) if row else 0,
            "min_build": int(getattr(row, "merchant_update_min_build_android", 0) or 0) if row else 0,
            "store_url": settings.UPDATE_STORE_URL_ANDROID_MERCHANT,
        },
    }

    await cache_set(_APP_CONFIG_CACHE_KEY, data, ttl=120)
    return data


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/api", include_in_schema=False)
async def root():
    return {"status": "ok", "app": "Monvo Loyalty API", "version": "1.0.0"}


@app.get("/health", tags=["Infrastructure"], summary="Health check (DB + Redis)")
async def health_check():
    from datetime import datetime, timezone
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    checks: dict = {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e}"
        checks["status"] = "degraded"

    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.REDIS_URL)
            await r.ping()
            await r.aclose()
            checks["redis"] = "ok"
        except Exception as e:
            checks["redis"] = f"error: {e}"
            checks["status"] = "degraded"

    # FCM (push) holati — sozlanmagan bo'lsa "off" (degraded emas, ixtiyoriy servis)
    try:
        from core.fcm import is_firebase_ready
        checks["fcm"] = "ok" if is_firebase_ready() else "off"
    except Exception as e:
        checks["fcm"] = f"error: {e}"

    status_code = 200 if checks["status"] == "ok" else 503
    return JSONResponse(content=checks, status_code=status_code)


# ── Static ───────────────────────────────────────────────────────────────────
# Admin SPA — /admin va /panel/* yo'llari React Router orqali ishlanadi
if os.path.isdir("landing") and os.path.isfile("landing/admin.html"):
    from fastapi.responses import FileResponse, RedirectResponse

    @app.get("/admin", include_in_schema=False)
    async def admin_redirect():
        # /admin → admin SPA login sahifasiga
        return RedirectResponse(url="/panel/login", status_code=307)

    @app.get("/panel", include_in_schema=False)
    @app.get("/panel/{full_path:path}", include_in_schema=False)
    async def serve_admin_spa(full_path: str = ""):
        # React Router har qanday /panel/* yo'lini admin.html'dan handle qiladi
        return FileResponse("landing/admin.html")

    @app.get("/merchant", include_in_schema=False)
    @app.get("/merchant/{full_path:path}", include_in_schema=False)
    async def serve_merchant_spa(full_path: str = ""):
        # Merchant SPA — alohida bundle, fallback admin.html ga
        merchant_html = "landing/merchant.html"
        if os.path.isfile(merchant_html):
            return FileResponse(merchant_html)
        return FileResponse("landing/admin.html")

    @app.get("/auth", include_in_schema=False)
    async def serve_auth_chooser():
        # Login chooser sahifasi — admin yoki merchant tanlash
        return FileResponse("landing/admin.html")

    @app.get("/api-docs", include_in_schema=False)
    async def serve_api_docs():
        # Public Merchant API hujjatlari (auth talab qilinmaydi)
        path = "landing/api-docs.html"
        if os.path.isfile(path):
            return FileResponse(path)
        return FileResponse("landing/admin.html")

    has_merchant = os.path.isfile("landing/merchant.html")
    logger.success(
        f"✅ Admin/Merchant SPA: /admin, /panel/*, /merchant/*"
        f"{' (merchant bundle)' if has_merchant else ' (fallback to admin)'}, /auth"
    )

# ── Per-language landing (SEO: hreflang + Telegram/WhatsApp preview) ─────────
# Telegram/Facebook/Yandex JS bajarmaydi — shunga statik HTML'ga til-bog'liq
# meta tag'lar SERVER-SIDE qo'shilishi kerak. /uz va /ru shuni ta'minlaydi.
_LANDING_INDEX_PATH = "landing/index.html"
_LANG_META = {
    "uz": {
        "title": "Monvo — QR Loyalty Kartalar Platformasi · Toshkent, O'zbekiston",
        "description": "Monvo — biznes uchun raqamli QR loyalty kartalar platformasi. Apple Wallet va Google Pay'da kartalar, push xabarlar, CRM va analitika. 1 200+ biznes ishlatadi. 14 kun bepul.",
        "og_locale": "uz_UZ",
        "og_locale_alt": "ru_RU",
        "url": "https://monvo.uz/uz",
    },
    "ru": {
        "title": "Monvo — Платформа цифровых карт лояльности · Ташкент, Узбекистан",
        "description": "Monvo — цифровые карты в Apple Wallet и Google Pay, push-рассылки, CRM и аналитика для бизнеса. Более 1 200 бизнесов в Ташкенте, Самарканде и Бухаре. 14 дней бесплатно.",
        "og_locale": "ru_RU",
        "og_locale_alt": "uz_UZ",
        "url": "https://monvo.uz/ru",
    },
}


def _render_landing_for_lang(lang: str) -> str:
    """Index.html'ni o'qib, til-bog'liq meta tag'larni almashtirib qaytaradi.

    Crawler (Telegram/Yandex) JS bajarmagani uchun ekvivalent ma'lumotlar
    statik HTML ichida bo'lishi shart.
    """
    meta = _LANG_META.get(lang, _LANG_META["uz"])
    try:
        with open(_LANDING_INDEX_PATH, "r", encoding="utf-8") as f:
            html = f.read()
    except FileNotFoundError:
        return f"<!doctype html><meta charset=utf-8><title>{meta['title']}</title>"

    # 1. <html lang="...">
    html = html.replace('<html lang="uz">', f'<html lang="{lang}">', 1)
    # 2. <title>
    import re as _re
    html = _re.sub(
        r"<title>[^<]*</title>",
        f"<title>{meta['title']}</title>",
        html,
        count=1,
    )
    # 3. meta description
    html = _re.sub(
        r'(<meta name="description" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["description"]}"',
        html,
        count=1,
    )
    # 4. og:title / og:description / og:url / og:locale
    html = _re.sub(
        r'(<meta property="og:title" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["title"]}"',
        html,
        count=1,
    )
    html = _re.sub(
        r'(<meta property="og:description" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["description"]}"',
        html,
        count=1,
    )
    html = _re.sub(
        r'(<meta property="og:url" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["url"]}"',
        html,
        count=1,
    )
    html = _re.sub(
        r'(<meta property="og:locale" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["og_locale"]}"',
        html,
        count=1,
    )
    html = _re.sub(
        r'(<meta property="og:locale:alternate" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["og_locale_alt"]}"',
        html,
        count=1,
    )
    # 5. twitter:title / twitter:description
    html = _re.sub(
        r'(<meta name="twitter:title" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["title"]}"',
        html,
        count=1,
    )
    html = _re.sub(
        r'(<meta name="twitter:description" content=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["description"]}"',
        html,
        count=1,
    )
    # 6. canonical
    html = _re.sub(
        r'(<link rel="canonical" href=)"[^"]*"',
        lambda m: f'{m.group(1)}"{meta["url"]}"',
        html,
        count=1,
    )
    return html


if os.path.isdir("landing") and os.path.isfile(_LANDING_INDEX_PATH):
    from fastapi.responses import HTMLResponse

    @app.get("/uz", include_in_schema=False)
    @app.get("/ru", include_in_schema=False)
    async def landing_lang_variant(request: Request):
        path = request.url.path
        lang = "ru" if path.endswith("/ru") else "uz"
        html = _render_landing_for_lang(lang)
        # Telegram/Facebook crawlers cache aggressively — short cache OK
        return HTMLResponse(
            content=html,
            headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=900"},
        )

    # Legal pages — Privacy va Terms (React Router clientside, lekin to'g'ridan
    # ochilsa ham ishlasin uchun index.html serve qilinadi)
    from fastapi.responses import FileResponse

    @app.get("/privacy", include_in_schema=False)
    @app.get("/terms", include_in_schema=False)
    async def landing_legal():
        return FileResponse(_LANDING_INDEX_PATH)

    logger.success("✅ Per-language landing: /uz, /ru (server-rendered meta) · /privacy, /terms")


@app.get("/mailru-domainOAOozC7nC0BSBgXW.html", include_in_schema=False)
async def mailru_domain_verification():
    return PlainTextResponse("mailru-domain: OAOozC7nC0BSBgXW")


# ── Smart-link: merchant QR (`/j/<id>`) ─────────────────────────────────────
# Skanerlangan QR shu sahifani ochadi. Sahifa:
#   1) platformani aniqlaydi (iOS / Android),
#   2) Monvo ilovasini `monvo://signup/<id>` deep-link bilan ochishga urinadi
#      (o'rnatilgan bo'lsa — ilova ochilib, shu merchant kartasi qo'shiladi),
#   3) ochilmasa (o'rnatilmagan) — store'ga o'tkazadi; "O'rnatish" tugmasi
#      bosilganda clipboard'ga `monvo-join:<id>` yoziladi → ilova birinchi
#      ochilganda o'qib, kartani avtomatik qo'shadi (deferred deep link).
_SMART_LINK_HTML = """<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Monvo</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:#0E1F17;color:#fff;display:flex;align-items:center;justify-content:center;
       padding:24px;-webkit-font-smoothing:antialiased}
  .card{text-align:center;max-width:340px;width:100%;
        animation:fade .5s ease both}
  @keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .logo{margin-bottom:32px} .logo img{height:38px;width:auto}
  .spin{width:30px;height:30px;border:2.5px solid rgba(255,255,255,.12);border-top-color:#3DCB7F;
        border-radius:50%;animation:r .8s linear infinite;margin:0 auto}
  @keyframes r{to{transform:rotate(360deg)}}
  p{font-size:14.5px;line-height:1.55;color:#9fb3a8;margin:22px 0 0}
  .fallback{margin-top:30px;font-size:13px;color:#6f8479}
  .fallback a{color:#3DCB7F;text-decoration:none;font-weight:500}
  .desk-btn{display:inline-block;margin-top:26px;background:#2F6B3F;color:#fff;text-decoration:none;
            font-size:15px;font-weight:600;padding:14px 28px;border-radius:14px}
  .hide{display:none}
</style></head>
<body>
  <div class="card">
    <div class="logo"><img src="/branding/monvo-logo-white.png" alt="Monvo"></div>
    <div id="spin" class="spin"></div>
    <p id="msg"></p>
    <div id="fallback" class="fallback hide"></div>
    <a id="deskbtn" class="desk-btn hide" href="#"></a>
  </div>
<script>
  var ID = __ID__;
  var DEEP = "monvo://signup/" + ID;
  var IOS = "__IOS__";
  var ANDROID = "__ANDROID__";
  var ua = navigator.userAgent || "";
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isRu = (navigator.language || navigator.userLanguage || '').toLowerCase().startsWith('ru');
  var store = isIOS ? IOS : ANDROID;

  var T = {
    opening: isRu ? 'Подождите…' : 'Bir lahza…',
    redirect: isRu ? 'Открываем App Store…' : 'App Store ochilmoqda…',
    desktop: isRu
      ? 'Откройте эту ссылку на смартфоне, чтобы получить карту лояльности.'
      : 'Bu havolani smartfonda oching — bonus kartangizni olasiz.',
    getApp: isRu ? 'Скачать приложение' : 'Ilovani yuklab olish',
    manual: isRu ? 'Не открылось? ' : 'Ochilmadimi? ',
    manualLink: isRu ? 'Открыть вручную' : 'Qo\'lda ochish',
  };

  document.getElementById('msg').textContent = T.opening;

  function showDesktop() {
    document.getElementById('spin').className = 'spin hide';
    document.getElementById('msg').textContent = T.desktop;
    var b = document.getElementById('deskbtn');
    b.textContent = T.getApp;
    b.href = IOS;
    b.className = 'desk-btn';
  }

  // Deferred deep link — store'dan o'rnatgandan keyin ilova clipboard'dan o'qib
  // kartani avtomatik qo'shadi.
  function rememberJoin() {
    try { navigator.clipboard.writeText('monvo-join:' + ID); } catch(e){}
  }

  if (!isIOS && !isAndroid) {
    showDesktop();
  } else {
    // Ilova ochildimi — sahifa fon'ga o'tsa (yoki blur bo'lsa) ha.
    var appOpened = false;
    function markOpened(){ appOpened = true; }
    document.addEventListener('visibilitychange', function(){
      if (document.hidden) markOpened();
    });
    window.addEventListener('pagehide', markOpened);
    window.addEventListener('blur', markOpened);

    // 1) Darhol ilovani ochishga urinamiz
    window.location.href = DEEP;

    // 2) ~1.4s da hali shu sahifada bo'lsak — ilova yo'q → avto App Store
    setTimeout(function() {
      if (appOpened) return;
      rememberJoin();
      document.getElementById('msg').textContent = T.redirect;
      // Subtil fallback — avto-redirect bloklansa, qo'lda link
      var fb = document.getElementById('fallback');
      fb.innerHTML = T.manual + '<a href="' + store + '">' + T.manualLink + '</a>';
      fb.className = 'fallback';
      window.location.replace(store);
    }, 1400);
  }
</script>
</body></html>"""


@app.get("/j/{merchant_id}", include_in_schema=False)
async def smart_join_link(merchant_id: int):
    from fastapi.responses import HTMLResponse
    html = (_SMART_LINK_HTML
            .replace("__ID__", str(int(merchant_id)))
            .replace("__IOS__", settings.UPDATE_STORE_URL_IOS)
            .replace("__ANDROID__", settings.UPDATE_STORE_URL_ANDROID))
    return HTMLResponse(content=html,
                        headers={"Cache-Control": "public, max-age=300"})


# ── Universal Links (iOS) + App Links (Android) ─────────────────────────────
# Bu fayllar ilovani `https://monvo.uz/j/<id>` havolasiga bog'laydi:
#   - iOS  o'rnatilgan bo'lsa → Safari ochilmaydi, ilova darhol ochiladi
#   - Android o'rnatilgan bo'lsa → brauzer ochilmaydi, ilova darhol ochiladi
# Ilova yo'q bo'lsa — odatdagidek `/j/<id>` sahifasi (store'ga redirect) ishlaydi.
#
# iOS appID = <TeamID>.<bundleId>. Android sha256 = imzo sertifikati barmoq izi.
# MUHIM: Google Play App Signing yoqilgan bo'lsa, bu yerdagi SHA256 — Play Console
# → App integrity → "App signing key certificate" dagi SHA256 bo'lishi SHART
# (upload key emas). Ikkalasini ham qo'shsa bo'ladi (massivda).
_IOS_APP_ID = "X94DWZBQV8.uz.monvo.app"
_ANDROID_PACKAGE = "uz.monvo.app"
_ANDROID_SHA256 = [
    # App signing key = upload key (Play Console'da tasdiqlangan — Google
    # alohida signing key yaratmagan, sizning kalitingiz bilan imzolaydi).
    "06:B9:CE:CE:F2:4D:B9:BF:CF:7E:56:B3:F5:85:64:D9:6C:FB:E5:51:7B:20:75:57:67:7A:39:90:58:DA:20:9A",
]


@app.get("/.well-known/apple-app-site-association", include_in_schema=False)
async def apple_app_site_association():
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={
            "applinks": {
                "details": [
                    {"appIDs": [_IOS_APP_ID], "components": [{"/": "/j/*"}]}
                ]
            }
        },
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/.well-known/assetlinks.json", include_in_schema=False)
async def android_assetlinks():
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=[
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": _ANDROID_PACKAGE,
                    "sha256_cert_fingerprints": _ANDROID_SHA256,
                },
            }
        ],
        headers={"Cache-Control": "public, max-age=3600"},
    )


if os.path.isdir("tg-static"):
    app.mount("/tg", StaticFiles(directory="tg-static", html=True), name="tg-app")
    logger.success("✅ Telegram Mini App: /tg")

# Merchant mobil ilova (Flutter web) — Telegram bot WebApp sifatida /m da.
if os.path.isdir("merchant-app"):
    app.mount("/m", StaticFiles(directory="merchant-app", html=True), name="merchant-app")
    logger.success("✅ Merchant mobile app (Telegram WebApp): /m")

# Yuklangan rasmlar (push banner, e'lon) — doimiy media papka (docker volume).
# '/' mount hammasini ushlagani uchun bundan OLDIN turishi shart.
os.makedirs("media/uploads", exist_ok=True)
app.mount("/media", StaticFiles(directory="media"), name="media")
logger.success("✅ Media (uploads): /media")

if os.path.isdir("landing"):
    app.mount("/", StaticFiles(directory="landing", html=True), name="landing")
    logger.success("✅ Landing page: /")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8181,
        reload=True,
        reload_excludes=["*.pyc", "__pycache__"],
    )
