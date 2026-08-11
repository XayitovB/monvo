"""POS integratsiya endpointlari.

  Merchant tomon (kirgan biznes egasi):
    GET    /merchants/me/pos-integrations
    POST   /merchants/me/pos-integrations          {provider, credentials}
    DELETE /merchants/me/pos-integrations/{provider}

  Admin tomon (platforma egasi):
    GET    /admin/pos/providers                    — toggle holati + merchant counti
    PATCH  /admin/pos/providers/{slug}             {enabled: bool}
"""
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_merchant
from core.tariff_gate import require_feature
from database import get_db
from models import AppSettings, Merchant, PosIntegration


def _public_base_url() -> str:
    """Webhook URL'da ishlatiladigan tashqi domen.

    Tartib:
      1. `PUBLIC_BASE_URL` env'i (eng aniq, deploy ishonchli o'rnatadi)
      2. Production APP_ENV → `https://monvo.uz`
      3. Aks holda `http://localhost:8000` (lokal dev)

    Eslatma: bu fallback request'siz chaqirilganda ishlatiladi (masalan
    response uchun). Request mavjud bo'lsa `_base_from_request` ni ishlating.
    """
    explicit = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if explicit:
        return explicit
    from config import settings as _settings
    if _settings.APP_ENV.lower() == "production":
        return "https://monvo.uz"
    return "http://localhost:8000"


def _base_from_request(request) -> str:
    """Request header'idan to'g'ri base URL'ni ajratish.

    Tartib:
      1. `PUBLIC_BASE_URL` env (qattiq override)
      2. `X-Forwarded-Proto` + `X-Forwarded-Host` (Railway, nginx, Cloudflare)
      3. `Host` header
      4. Statik fallback (`_public_base_url`)

    Bu PUBLIC_BASE_URL/APP_ENV sozlanmagan bo'lsa ham
    `https://monvo.uz` ni qaytaradi (request monvo.uz dan kelgan bo'lsa).
    """
    explicit = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if explicit:
        return explicit
    if request is None:
        return _public_base_url()
    headers = request.headers
    fwd_host = headers.get("x-forwarded-host") or headers.get("X-Forwarded-Host")
    fwd_proto = headers.get("x-forwarded-proto") or headers.get("X-Forwarded-Proto")
    host = (fwd_host or headers.get("host") or "").split(",")[0].strip()
    if not host or host.startswith("localhost") or host.startswith("127.") or host.startswith("0."):
        return _public_base_url()
    proto = (fwd_proto or "").split(",")[0].strip().lower() or "https"
    return f"{proto}://{host}"


def _webhook_url(provider: str, merchant_id: int, token: str, *, request=None) -> str:
    base = _base_from_request(request) if request is not None else _public_base_url()
    path = f"/pos/webhooks/{provider}/{merchant_id}?token={token}"
    return f"{base}{path}"

router = APIRouter(tags=["🔌 POS Integrations"])


# ── Provider catalogue (single source of truth) ─────────────────────────────
PROVIDER_CATALOGUE = [
    {
        "slug": "billz",
        "name": "Billz",
        "tagline_uz": "O'zbekiston chakana savdo POS · BILLZ 2.0",
        "tagline_ru": "POS для розничной торговли Узбекистана · BILLZ 2.0",
        "doc_url": "https://billzuz.notion.site/API-c2f91aa254f94f8eb7c1b26415dcb25b",
        "credential_fields": [
            {"key": "secret_token", "label": "Secret token", "type": "password", "placeholder": "Billz UI → API интеграция → создать ключ"},
        ],
    },
    {
        "slug": "iiko",
        "name": "iiko",
        "tagline_uz": "Restoran va kafelar uchun POS",
        "tagline_ru": "POS для ресторанов и кафе",
        "doc_url": "https://documenter.getpostman.com/view/2896430/TVemBpmn",
        "credential_fields": [
            {"key": "api_login",       "label": "apiLogin (UUID)",  "type": "text", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx"},
            {"key": "organization_id", "label": "Organization ID",  "type": "text", "placeholder": "iiko organization UUID"},
        ],
    },
    {
        "slug": "yclients",
        "name": "YCLIENTS",
        "tagline_uz": "Salon, barbershop va xizmat uchun CRM/POS",
        "tagline_ru": "CRM/POS для салонов, барбершопов и услуг",
        "doc_url": "https://developers.yclients.com/",
        "credential_fields": [
            {"key": "company_id",   "label": "Company ID",    "type": "text",     "placeholder": "123456"},
            {"key": "partner_token","label": "Partner token",  "type": "password", "placeholder": "•••••••"},
            {"key": "user_token",   "label": "User token",     "type": "password", "placeholder": "•••••••"},
        ],
    },
    {
        "slug": "rkeeper",
        "name": "r_keeper",
        "tagline_uz": "Restoran tarmoqlari uchun klassik POS",
        "tagline_ru": "Классический POS для сетей ресторанов",
        "doc_url": "https://docs.rkeeper.ru/",
        "credential_fields": [
            {"key": "api_url",   "label": "API server URL",          "type": "text",     "placeholder": "https://rk-cloud.example.uz"},
            {"key": "object_id", "label": "Restaurant / Object ID",   "type": "text",     "placeholder": "rk_xxxxxx"},
            {"key": "api_token", "label": "API token",                "type": "password", "placeholder": "•••••••"},
        ],
    },
    {
        "slug": "onec",
        "name": "1C",
        "tagline_uz": "1C: Roznitsa / UNF / UT — chakana savdo va omborxona",
        "tagline_ru": "1C: Розница / УНФ / УТ — розничная торговля и склад",
        "doc_url": "https://its.1c.ru/db/v8313doc",
        "credential_fields": [
            {"key": "base_url",     "label": "Web-публикация URL",  "type": "text",    "placeholder": "https://1c.example.uz/erp/odata/standard.odata"},
            {"key": "username",     "label": "Пользователь",        "type": "text",    "placeholder": "monvo_api"},
            {"key": "password",     "label": "Пароль",              "type": "password","placeholder": "•••••••"},
            {"key": "organization", "label": "Код организации",     "type": "text",    "placeholder": "00000001"},
        ],
    },
    {
        "slug": "poster",
        "name": "Poster POS",
        "tagline_uz": "Cloud POS — kafe, bar va restoranlar uchun",
        "tagline_ru": "Cloud POS — для кафе, баров и ресторанов",
        "doc_url": "https://dev.joinposter.com/",
        "credential_fields": [
            {"key": "account_name", "label": "Субдомен аккаунта", "type": "text",     "placeholder": "joinposter.com: <name>.joinposter.com"},
            {"key": "api_token",    "label": "API token",          "type": "password", "placeholder": "•••••••"},
        ],
    },
    {
        "slug": "moysklad",
        "name": "MoySklad",
        "tagline_uz": "Cloud omborxona + POS — kichik chakana savdo uchun",
        "tagline_ru": "Cloud склад + POS — для малой розничной торговли",
        "doc_url": "https://dev.moysklad.ru/doc/api/remap/1.2/",
        "credential_fields": [
            {"key": "access_token", "label": "Access token",    "type": "password", "placeholder": "•••••••"},
            {"key": "organization", "label": "Organization ID", "type": "text",     "placeholder": "MoySklad organization UUID"},
        ],
    },
    {
        "slug": "alipos",
        "name": "ALIPOS",
        "tagline_uz": "Restoran agregator (Yandex Eats, Wolt) uchun cloud POS",
        "tagline_ru": "Cloud POS для агрегаторов (Yandex Eats, Wolt)",
        "doc_url": "https://docs.alipos.uz",
        "credential_fields": [
            {"key": "client_id",     "label": "Client ID",     "type": "text",     "placeholder": "Из кабинета партнёра ALIPOS"},
            {"key": "client_secret", "label": "Client secret", "type": "password", "placeholder": "•••••••"},
            {"key": "restaurant_id", "label": "Restaurant ID", "type": "text",     "placeholder": "ALIPOS restaurant UUID (опционально — для branch mapping)"},
        ],
    },
]
PROVIDER_SLUGS = {p["slug"] for p in PROVIDER_CATALOGUE}

_TOGGLE_ATTR = {
    "billz":    "pos_billz_enabled",
    "iiko":     "pos_iiko_enabled",
    "yclients": "pos_yclients_enabled",
    "rkeeper":  "pos_rkeeper_enabled",
    "onec":     "pos_onec_enabled",
    "poster":   "pos_poster_enabled",
    "moysklad": "pos_moysklad_enabled",
    "alipos":   "pos_alipos_enabled",
}


async def _get_or_create_settings(db: AsyncSession) -> AppSettings:
    row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if row is None:
        row = AppSettings(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _is_provider_enabled(settings: AppSettings, slug: str) -> bool:
    attr = _TOGGLE_ATTR.get(slug)
    return bool(getattr(settings, attr, False)) if attr else False


def _set_provider_enabled(settings: AppSettings, slug: str, value: bool) -> None:
    attr = _TOGGLE_ATTR.get(slug)
    if attr:
        setattr(settings, attr, value)


# ═══ MERCHANT-SIDE ═══════════════════════════════════════════════════════════
class _ConnectIn(BaseModel):
    provider: str = Field(min_length=1, max_length=40)
    credentials: dict = Field(default_factory=dict)


@router.get("/merchants/me/pos-integrations", summary="Mavjud POS integratsiyalar va merchant ulanishlari")
async def merchant_list_integrations(
    request: Request,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    settings = await _get_or_create_settings(db)
    rows = (await db.execute(
        select(PosIntegration).where(PosIntegration.merchant_id == merchant.id)
    )).scalars().all()
    by_provider = {r.provider: r for r in rows}

    out = []
    for provider in PROVIDER_CATALOGUE:
        slug = provider["slug"]
        if not _is_provider_enabled(settings, slug):
            continue
        row = by_provider.get(slug)
        wh_token = (row.credentials or {}).get("webhook_token") if row else None
        out.append({
            **provider,
            "enabled_globally": True,
            "connected": row is not None,
            "is_active": row.is_active if row else False,
            "last_sync_at": row.last_sync_at.isoformat() if row and row.last_sync_at else None,
            "last_error": (row.last_error or "") if row else "",
            "webhook_url": _webhook_url(slug, merchant.id, wh_token, request=request) if wh_token else None,
        })
    return out


@router.post("/merchants/me/pos-integrations", status_code=201, summary="POS integratsiyani ulash / yangilash")
async def merchant_connect_integration(
    body: _ConnectIn,
    request: Request,
    merchant: Merchant = Depends(require_feature("pos_integration")),
    db: AsyncSession = Depends(get_db),
):
    if body.provider not in PROVIDER_SLUGS:
        raise HTTPException(400, "Noma'lum POS provayder")
    settings = await _get_or_create_settings(db)
    if not _is_provider_enabled(settings, body.provider):
        raise HTTPException(403, "This POS provider is not available yet")

    # Validate that all required credential keys are present.
    schema = next(p for p in PROVIDER_CATALOGUE if p["slug"] == body.provider)
    required = {f["key"] for f in schema["credential_fields"]}
    missing = required - set(k for k, v in body.credentials.items() if v)
    if missing:
        raise HTTPException(400, f"Missing fields: {', '.join(sorted(missing))}")

    existing = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant.id,
            PosIntegration.provider == body.provider,
        )
    )).scalar_one_or_none()

    # Webhook tokenni eski connection'dan saqlab qolish (yangi ulanishda yangi token)
    creds = dict(body.credentials)
    if existing and existing.credentials and existing.credentials.get("webhook_token"):
        creds["webhook_token"] = existing.credentials["webhook_token"]
    else:
        creds["webhook_token"] = secrets.token_urlsafe(24)
    # Webhook signature secret — har bir connection uchun yangi (eski terminal_branch_map'ni saqlaymiz)
    if existing and existing.credentials and existing.credentials.get("webhook_secret"):
        creds["webhook_secret"] = existing.credentials["webhook_secret"]
    else:
        creds["webhook_secret"] = secrets.token_urlsafe(32)
    if existing and existing.credentials and "terminal_branch_map" in (existing.credentials or {}):
        creds.setdefault("terminal_branch_map", existing.credentials["terminal_branch_map"])

    if existing:
        existing.credentials = creds
        existing.is_active = True
        existing.last_error = ""
    else:
        db.add(PosIntegration(
            merchant_id=merchant.id,
            provider=body.provider,
            credentials=creds,
            is_active=True,
        ))
    await db.commit()

    webhook_url = _webhook_url(body.provider, merchant.id, creds["webhook_token"], request=request)

    # ── Auto-webhook registration (public URL bo'lsa) ──
    auto_webhook = {"attempted": False, "ok": False}
    if webhook_url.startswith("http"):
        if body.provider == "iiko":
            try:
                from integrations.iiko import IikoClient
                async with IikoClient(
                    api_login=creds.get("api_login"),
                    organization_id=creds.get("organization_id"),
                ) as client:
                    ok = await client.update_webhooks_settings(webhook_url=webhook_url)
                    auto_webhook = {"attempted": True, "ok": bool(ok)}
            except Exception:
                auto_webhook = {"attempted": True, "ok": False}
        elif body.provider == "billz":
            # BILLZ 2 webhook'larni qo'llab-quvvatlamasligi mumkin —
            # buning o'rniga polling worker (har 15 daq) ishlatiladi.
            # Token'ni tasdiqlab qo'yamiz.
            try:
                from integrations.billz import BillzClient
                async with BillzClient(secret_token=creds.get("secret_token") or creds.get("api_secret") or "") as client:
                    ok = await client.verify()
                    auto_webhook = {"attempted": False, "ok": bool(ok), "mode": "polling"}
            except Exception:
                auto_webhook = {"attempted": False, "ok": False, "mode": "polling"}

    return {
        "ok": True,
        "provider": body.provider,
        "webhook_url": webhook_url,
        "webhook_secret": creds["webhook_secret"],  # merchant'ga bir marta ko'rsatamiz
        "auto_webhook": auto_webhook,
    }


@router.delete("/merchants/me/pos-integrations/{provider}", summary="POS integratsiyani uzish")
async def merchant_disconnect_integration(
    provider: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant.id,
            PosIntegration.provider == provider,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Ulanish topilmadi")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Verify connected integration (saqlangan credentialni tekshirish) ────────
@router.post("/merchants/me/pos-integrations/{provider}/verify", summary="Ulangan POS integratsiyani saqlangan credential bilan tekshirish")
async def merchant_verify_integration(
    provider: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Allaqachon ulangan provayder ulanishini real API bilan tekshiradi.

    Hozir to'liq qo'llab-quvvatlanadi: Billz va iiko.
    Boshqalar uchun {ok: true, not_implemented: true} qaytariladi.
    """
    if provider not in PROVIDER_SLUGS:
        raise HTTPException(400, "Noma'lum POS provayder")
    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant.id,
            PosIntegration.provider == provider,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Ulanish topilmadi")

    creds = row.credentials or {}
    last_error = ""
    ok = False
    extra: dict = {}

    if provider == "billz":
        secret_token = creds.get("secret_token") or creds.get("api_secret")
        if not secret_token:
            last_error = "secret_token saqlanmagan"
        else:
            try:
                from integrations.billz import BillzApiError, BillzClient
                async with BillzClient(secret_token=secret_token) as client:
                    ok = await client.verify()
                    if not ok:
                        last_error = "Token tasdiqlanmadi"
            except BillzApiError as e:
                last_error = f"Billz API: {e.status} — {str(e.body)[:160]}"
            except Exception as e:  # noqa: BLE001
                last_error = f"Ulanish xatosi: {type(e).__name__}: {str(e)[:160]}"

    elif provider == "iiko":
        api_login = creds.get("api_login")
        org_id = creds.get("organization_id")
        if not api_login or not org_id:
            last_error = "api_login yoki organization_id saqlanmagan"
        else:
            try:
                from integrations.iiko import IikoApiError, IikoClient
                async with IikoClient(api_login=api_login, organization_id=org_id) as client:
                    orgs = await client.list_organizations()
                    if any(o["id"] == org_id for o in orgs):
                        ok = True
                        extra["organizations"] = orgs[:5]
                    else:
                        last_error = "organization_id topilmadi"
            except IikoApiError as e:
                last_error = f"iiko API: {e.status} — {str(e.body)[:160]}"
            except Exception as e:  # noqa: BLE001
                last_error = f"Ulanish xatosi: {type(e).__name__}: {str(e)[:160]}"
    else:
        return {"ok": True, "not_implemented": True, "provider": provider}

    # Holat'ni saqlab qo'yamiz — pos_polling worker last_error'dan foydalanadi
    row.last_error = "" if ok else last_error[:500]
    if ok:
        from datetime import datetime, timezone as _tz
        row.last_sync_at = datetime.now(_tz.utc)
    await db.commit()

    return {
        "ok": ok,
        "provider": provider,
        "error": last_error if not ok else "",
        **extra,
    }


# ── Test connection (saqlamasdan tekshirish) ────────────────────────────────
@router.post("/merchants/me/pos-integrations/test", summary="POS credential'larni saqlamasdan tekshirish")
async def merchant_test_integration(
    body: _ConnectIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Merchant credential'larni saqlashdan oldin ulanish ishonchli ekanligini tekshiradi.

    Hozir to'liq qo'llab-quvvatlanadi: iiko. Boshqa provayderlar uchun
    credential'lar mavjudligi tekshiriladi va `not_implemented=true` qaytariladi.
    """
    if body.provider not in PROVIDER_SLUGS:
        raise HTTPException(400, "Noma'lum POS provayder")
    settings = await _get_or_create_settings(db)
    if not _is_provider_enabled(settings, body.provider):
        raise HTTPException(403, "This POS provider is not available yet")

    schema = next(p for p in PROVIDER_CATALOGUE if p["slug"] == body.provider)
    required = {f["key"] for f in schema["credential_fields"]}
    missing = required - set(k for k, v in body.credentials.items() if v)
    if missing:
        raise HTTPException(400, f"Missing fields: {', '.join(sorted(missing))}")

    if body.provider == "iiko":
        api_login = body.credentials.get("api_login")
        org_id = body.credentials.get("organization_id")
        try:
            from integrations.iiko import IikoApiError, IikoClient
            async with IikoClient(api_login=api_login, organization_id=org_id) as client:
                orgs = await client.list_organizations()
                if not any(o["id"] == org_id for o in orgs):
                    return {
                        "ok": False,
                        "error": "organization_id topilmadi. Mavjud organizatsiyalar:",
                        "organizations": orgs[:10],
                    }
                terminals = []
                try:
                    terminals = await client.list_terminals()
                except IikoApiError:
                    pass  # terminallarni ololmasak ham ulanish OK
                return {
                    "ok": True,
                    "organizations": orgs[:10],
                    "terminals": terminals[:30],
                }
        except IikoApiError as e:
            return {"ok": False, "error": f"iiko API: {e.status} — {e.body[:200]}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"Ulanish xatosi: {type(e).__name__}: {str(e)[:200]}"}

    if body.provider == "billz":
        secret_token = body.credentials.get("secret_token") or body.credentials.get("api_secret")
        if not secret_token:
            return {"ok": False, "error": "secret_token kerak"}
        try:
            from integrations.billz import BillzApiError, BillzClient
            async with BillzClient(secret_token=secret_token) as client:
                ok = await client.verify()
                if not ok:
                    return {"ok": False, "error": "Token tasdiqlanmadi"}
                return {
                    "ok": True,
                    "note": "Billz 2 token ishladi. Polling har 15 daq sotuvlarni Monvo'ga olib keladi va Billz hisoblagan cashback'ni mijoz balansiga qo'shadi.",
                }
        except BillzApiError as e:
            return {"ok": False, "error": f"Billz API: {e.status} — {e.body[:200]}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"Ulanish xatosi: {type(e).__name__}: {str(e)[:200]}"}

    return {"ok": True, "not_implemented": True, "note": f"{body.provider} uchun test endpoint yo'q — hozircha credential'lar formati tekshirildi"}


# ── Branch mapping (iiko terminal → Monvo filial) ──────────────────────────
class _BranchMapIn(BaseModel):
    terminal_branch_map: dict[str, int] = Field(default_factory=dict)


@router.put(
    "/merchants/me/pos-integrations/{provider}/branch-map",
    summary="Terminal-branch mapping'ni yangilash",
)
async def merchant_update_branch_map(
    provider: str,
    body: _BranchMapIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant.id,
            PosIntegration.provider == provider,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Ulanish topilmadi")
    creds = dict(row.credentials or {})
    # Faqat int qiymatli mapping'larni qabul qilamiz
    cleaned: dict[str, int] = {}
    for k, v in body.terminal_branch_map.items():
        try:
            cleaned[str(k)] = int(v)
        except (TypeError, ValueError):
            continue
    creds["terminal_branch_map"] = cleaned
    row.credentials = creds
    await db.commit()
    return {"ok": True, "terminal_branch_map": cleaned}


# ═══ ADMIN-SIDE ══════════════════════════════════════════════════════════════
class _ToggleIn(BaseModel):
    enabled: bool


@router.get("/admin/pos/providers", summary="POS provayderlar va ularning ulanish soni")
async def admin_list_providers(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    settings = await _get_or_create_settings(db)
    counts_q = (await db.execute(
        select(PosIntegration.provider, sa_func.count(PosIntegration.id))
        .where(PosIntegration.is_active.is_(True))
        .group_by(PosIntegration.provider)
    )).all()
    counts: dict[str, int] = {row[0]: int(row[1]) for row in counts_q}

    return [
        {
            **provider,
            "enabled": _is_provider_enabled(settings, provider["slug"]),
            "connected_merchants": counts.get(provider["slug"], 0),
        }
        for provider in PROVIDER_CATALOGUE
    ]


@router.patch("/admin/pos/providers/{slug}", summary="POS provayderni global yoqish / o'chirish")
async def admin_toggle_provider(
    slug: str,
    body: _ToggleIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if slug not in PROVIDER_SLUGS:
        raise HTTPException(404, "Provayder topilmadi")
    settings = await _get_or_create_settings(db)
    _set_provider_enabled(settings, slug, body.enabled)
    await db.commit()
    return {"ok": True, "slug": slug, "enabled": body.enabled}


@router.post("/admin/pos/poll-now", summary="POS polling'ni darhol ishga tushirish (diagnostika)")
async def admin_poll_now(admin=Depends(get_current_admin)):
    """Schedulerni kutmasdan barcha aktiv POS integratsiyalar uchun polling qilish.

    Yangi cheklar darhol Monvo'ga tortib olinadi. Javob: provayderlar
    bo'yicha qayta ishlangan / o'tkazib yuborilgan / xato sonlari.
    """
    from core.pos_polling import run_pos_polling
    summary = await run_pos_polling()
    return {"ok": True, "summary": summary}


@router.get(
    "/admin/pos/diagnose/{merchant_id}/{provider}",
    summary="POS ulanish diagnostikasi — saqlangan tokenlar bilan provider API'ga so'rov",
)
async def admin_pos_diagnose(
    merchant_id: int,
    provider: str,
    minutes: int = 60,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Berilgan merchant uchun POS API'dan oxirgi N daqiqalik xom javobni qaytaradi
    (commit qilinmaydi). Cashback summasi, mijoz id, telefon — hammasi ko'rinadi.
    """
    from datetime import datetime, timedelta, timezone

    if provider not in PROVIDER_SLUGS:
        raise HTTPException(400, "Noma'lum POS provayder")
    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant_id,
            PosIntegration.provider == provider,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Ulanish topilmadi")

    creds = row.credentials or {}
    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=max(1, min(int(minutes), 1440)))

    if provider == "billz":
        secret_token = creds.get("secret_token") or creds.get("api_secret")
        if not secret_token:
            return {"ok": False, "error": "secret_token saqlanmagan"}
        from integrations.billz import BillzApiError, BillzClient
        try:
            async with BillzClient(secret_token=secret_token) as client:
                sales = await client.list_sales(from_dt=since, to_dt=now)
        except BillzApiError as e:
            return {"ok": False, "error": f"Billz API: {e.status} — {str(e.body)[:300]}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"}
        return {
            "ok": True,
            "provider": "billz",
            "window": {"from": since.isoformat(), "to": now.isoformat(), "minutes": int(minutes)},
            "count": len(sales),
            "sales": [
                {
                    "sale_id": s.sale_id,
                    "shop_id": s.shop_id,
                    "total": s.total,
                    "cashback_amount": s.cashback_amount,
                    "customer_id": s.customer_id,
                    "customer_phone": s.customer_phone,
                    "closed_at": s.closed_at.isoformat() if s.closed_at else None,
                    "is_refund": s.is_refund,
                }
                for s in sales
            ],
        }

    if provider == "iiko":
        api_login = creds.get("api_login")
        org_id = creds.get("organization_id")
        if not api_login or not org_id:
            return {"ok": False, "error": "api_login yoki organization_id saqlanmagan"}
        from integrations.iiko import IikoApiError, IikoClient
        try:
            async with IikoClient(api_login=api_login, organization_id=org_id) as client:
                orders = await client.fetch_orders_by_period(from_dt=since, to_dt=now)
        except IikoApiError as e:
            return {"ok": False, "error": f"iiko API: {e.status} — {str(e.body)[:300]}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"}
        return {
            "ok": True,
            "provider": "iiko",
            "window": {"from": since.isoformat(), "to": now.isoformat(), "minutes": int(minutes)},
            "count": len(orders),
            "orders": [
                {
                    "order_id": o.order_id,
                    "terminal_id": o.terminal_id,
                    "sum": o.sum,
                    "customer_id": o.customer_id,
                    "customer_phone": o.customer_phone,
                    "is_deleted": o.is_deleted,
                }
                for o in orders
            ],
        }

    return {"ok": False, "error": f"{provider} uchun diagnose endpoint hali qo'llab-quvvatlanmagan"}


@router.get(
    "/admin/pos/probe-billz/{merchant_id}",
    summary="Billz API probe — ko'p endpoint'larni sinab ko'rish",
)
async def admin_billz_probe(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Billz API'ning turli endpoint'lariga GET so'rovi yuboradi va xom javob qaytaradi.
    Hech qanday parsing yoki commit yo'q — to'g'ridan-to'g'ri token bilan probe.

    `/sales`, `/orders`, `/transactions`, `/checks`, `/receipts` va shu kabilarni
    sinab ko'radi. Maqsad — Billz API'ning qaysi yo'l bilan ishlashini topish.
    """
    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant_id,
            PosIntegration.provider == "billz",
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Billz ulanish topilmadi")

    secret_token = (row.credentials or {}).get("secret_token") or (row.credentials or {}).get("api_secret")
    if not secret_token:
        return {"ok": False, "error": "secret_token saqlanmagan"}

    from integrations.billz import BillzClient
    # Real Billz endpoint (Notion docs): GET /v3/order-search
    # company_id JWT'dan ajratilib paramga qo'shiladi (BillzClient ichida).
    from datetime import datetime, timedelta, timezone
    _now = datetime.now(timezone.utc)
    _ymd = lambda d: d.strftime("%Y-%m-%d")

    # To'g'ri endpoint orqali sinov — company_id'ni client get_company_id() dan olamiz
    probe_paths: list = []  # populated below per-iteration after we have the company_id

    results = []
    auth_response = None
    async with BillzClient(secret_token=secret_token) as client:
        # /auth/login javobining to'liq tarkibini ko'rish
        try:
            client._client.timeout = 15  # type: ignore[union-attr]
            r = await client._client.post(  # type: ignore[union-attr]
                "/auth/login",
                json={"secret_token": secret_token},
            )
            auth_response = {
                "status": r.status_code,
                "body": r.json() if r.text else None,
            }
        except Exception as e:  # noqa: BLE001
            auth_response = {"error": f"{type(e).__name__}: {str(e)[:300]}"}

        try:
            token = await client.get_token()
            token_ok = bool(token)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"Token olishda xato: {type(e).__name__}: {str(e)[:200]}", "auth_response": auth_response}

        company_id = await client.get_company_id()
        # JWT'dan ajratib olingan company_id bilan order-search'ni turli oraliqlarda sinaymiz
        for days in (1, 7, 30, 90):
            since = _now - timedelta(days=days)
            probe_paths.append((
                "GET", "/v3/order-search",
                {
                    "company_id": company_id,
                    "start_date": _ymd(since),
                    "end_date":   _ymd(_now),
                    "limit": 5,
                    "page": 1,
                },
            ))

        for method, path, body in probe_paths:
            try:
                if method == "GET":
                    data = await client._get(path, params=body or {})
                else:
                    data = await client._post(path, payload=body or {})
                shape = type(data).__name__
                if isinstance(data, dict):
                    keys = list(data.keys())[:8]
                    sample = str(data)[:300]
                elif isinstance(data, list):
                    keys = [f"len={len(data)}"]
                    sample = str(data)[:300]
                else:
                    keys = []
                    sample = str(data)[:300]
                results.append({
                    "method": method, "path": path, "body": body,
                    "status": "ok", "shape": shape, "keys": keys, "preview": sample,
                })
            except Exception as e:  # noqa: BLE001
                msg = str(e)[:200]
                results.append({
                    "method": method, "path": path, "body": body,
                    "status": "error", "error": msg,
                })

    return {
        "ok": True,
        "token_ok": token_ok,
        "company_id": company_id,
        "auth_response": auth_response,
        "tried": len(probe_paths),
        "results": results,
    }


@router.post(
    "/admin/pos/replay-billz/{merchant_id}",
    summary="Billz sotuvlarini berilgan oraliqda qayta ishlash (polling lookback'ni chetlab o'tib)",
)
async def admin_billz_replay(
    merchant_id: int,
    days: int = 7,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Berilgan kunlar oraliqdagi barcha Billz sotuvlarini bevosita
    `commit_pos_sale` orqali yozadi. Polling 30-daq oynasini chetlab o'tadi.
    Idempotent — eski tranzaksiyalar duplicate skip bo'ladi.
    """
    from datetime import datetime, timedelta, timezone

    from core.pos_engine import NormalizedSale, commit_pos_sale
    from integrations.billz import BillzClient

    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant_id,
            PosIntegration.provider == "billz",
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Billz ulanish topilmadi")

    secret_token = (row.credentials or {}).get("secret_token") or (row.credentials or {}).get("api_secret")
    if not secret_token:
        return {"ok": False, "error": "secret_token saqlanmagan"}

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(int(days), 90)))

    async with BillzClient(secret_token=secret_token) as client:
        sales = await client.list_sales(from_dt=since, to_dt=now, limit=200)

    processed = 0
    skipped = 0
    errors: list = []
    details: list = []

    for s in sales:
        forced = int(round(s.cashback_amount)) if s.cashback_amount > 0 else None
        sale = NormalizedSale(
            external_ref=s.sale_id,
            amount=s.total,
            phone=s.customer_phone,
            external_customer_id=s.customer_id,
            external_terminal_id=s.shop_id,
            kind="refund" if s.is_refund else "earn",
            forced_points=forced,
            note="Billz-replay",
        )
        try:
            result = await commit_pos_sale(integration=row, sale=sale, db=db)
            details.append({
                "sale_id": s.sale_id,
                "phone": s.customer_phone,
                "customer_id": s.customer_id,
                "amount": s.total,
                "cashback_amount": s.cashback_amount,
                "result": "skipped" if result is None else f"committed (tx={getattr(result, 'transaction_id', '?')})",
            })
            if result is None:
                skipped += 1
            else:
                processed += 1
        except Exception as e:  # noqa: BLE001
            errors.append({"sale_id": s.sale_id, "error": f"{type(e).__name__}: {str(e)[:200]}"})

    return {
        "ok": True,
        "window": {"from": since.isoformat(), "to": now.isoformat(), "days": int(days)},
        "fetched": len(sales),
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "details": details,
    }


@router.get(
    "/admin/pos/billz-raw/{merchant_id}",
    summary="Billz /v3/order-search xom javobi (kesilmagan)",
)
async def admin_billz_raw(
    merchant_id: int,
    days: int = 30,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Billz /v3/order-search'ni chaqirib to'liq parsing'siz xom JSON qaytaradi."""
    from datetime import datetime, timedelta, timezone

    row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant_id,
            PosIntegration.provider == "billz",
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Billz ulanish topilmadi")
    secret_token = (row.credentials or {}).get("secret_token") or (row.credentials or {}).get("api_secret")
    if not secret_token:
        return {"ok": False, "error": "secret_token saqlanmagan"}

    from integrations.billz import BillzClient
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(int(days), 90)))

    async with BillzClient(secret_token=secret_token) as client:
        await client.get_token()
        company_id = await client.get_company_id()
        try:
            data = await client._get(
                "/v3/order-search",
                params={
                    "company_id": company_id,
                    "start_date": since.strftime("%Y-%m-%d"),
                    "end_date":   now.strftime("%Y-%m-%d"),
                    "limit": 50,
                    "page": 1,
                },
            )
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"}

    return {"ok": True, "company_id": company_id, "raw": data}
