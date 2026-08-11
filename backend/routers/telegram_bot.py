"""
routers/telegram_bot.py
────────────────────────
Aiogram 3.x + FastAPI webhook integratsiya.
Bot va backend bitta processda, bitta DB sessiyasi bilan ishlaydi.

Lifecycle:
  - FastAPI startup → bot.set_webhook()
  - FastAPI shutdown → bot.delete_webhook() + session.close()

Endpoints:
  POST /bot/webhook     — Telegram update qabul qilish (aiogram Dispatcher)
  GET  /bot/set-webhook — Webhook URL ni Telegram ga o'rnatish
  GET  /bot/info        — Bot + webhook holati
"""
import os
import secrets
import string
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

from aiogram import Bot, Dispatcher, Router, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    LinkPreviewOptions,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
    WebAppInfo,
)
from fastapi import APIRouter, Request
from fastapi.responses import Response
from loguru import logger

from config import settings


# ── FSM storage ───────────────────────────────────────────────────────────────
# Bir nechta uvicorn worker bo'lgani uchun onboarding holati Redis'da saqlanadi
# (MemoryStorage har worker'da alohida bo'lib, webhook update boshqa worker'ga
# tushganda holat yo'qoladi). Redis bo'lmasa — dev uchun MemoryStorage.
def _make_storage():
    if settings.REDIS_URL:
        try:
            from aiogram.fsm.storage.redis import RedisStorage
            return RedisStorage.from_url(settings.REDIS_URL)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"RedisStorage yaratilmadi ({e}) — MemoryStorage")
    return MemoryStorage()


# ── Bot & Dispatcher (bitta instance, startup da yaratiladi) ──────────────────

bot: Bot | None = None
dp = Dispatcher(storage=_make_storage())
tg = Router()
dp.include_router(tg)


class Onboard(StatesGroup):
    lang = State()
    privacy = State()
    phone = State()
    code = State()


# ── Localized bot copy ─────────────────────────────────────────────────────────
def _L(lang: str) -> dict:
    ru = lang == "ru"
    return {
        "choose_lang": "Tilni tanlang / Выберите язык:",
        # {url} — Telegram HTML <a href> sifatida render qiladi (parse_mode=HTML).
        "privacy": (
            "🔒 Продолжая, вы соглашаетесь с "
            "<a href=\"{url}\">Политикой конфиденциальности</a> Monvo. "
            "Мы храним только номер телефона и данные карт лояльности."
            if ru else
            "🔒 Davom etish orqali siz Monvo "
            "<a href=\"{url}\">Maxfiylik siyosati</a>ga rozilik bildirasiz. "
            "Biz faqat telefon raqamingiz va loyalty karta maʼlumotlaringizni saqlaymiz."
        ),
        "agree": "✅ Согласен, продолжить" if ru else "✅ Roziman, davom etish",
        "ask_phone": (
            "📱 Отправьте номер телефона кнопкой ниже или введите вручную (+998…)."
            if ru else
            "📱 Pastdagi tugma orqali telefon raqamingizni yuboring yoki qoʻlda kiriting (+998…)."
        ),
        "share_btn": "📱 Отправить номер" if ru else "📱 Raqamni yuborish",
        "bad_phone": (
            "❌ Номер не распознан. Введите в формате +998XXXXXXXXX."
            if ru else
            "❌ Raqam notoʻgʻri. +998XXXXXXXXX koʻrinishida kiriting."
        ),
        "code_sent": (
            "✅ Код подтверждения отправлен на {phone}.\nВведите 6-значный код:"
            if ru else
            "✅ Tasdiqlash kodi {phone} raqamiga yuborildi.\n6 xonali kodni kiriting:"
        ),
        "sms_fail": (
            "⚠️ Не удалось отправить SMS. Попробуйте позже: /start"
            if ru else
            "⚠️ SMS yuborilmadi. Keyinroq urinib koʻring: /start"
        ),
        "bad_code": (
            "❌ Неверный код. Попробуйте ещё раз или /start заново."
            if ru else
            "❌ Kod notoʻgʻri. Qayta kiriting yoki /start bosing."
        ),
        "blocked": "⛔️ Аккаунт заблокирован." if ru else "⛔️ Hisob bloklangan.",
        "done": (
            "🎉 Готово! Нажмите кнопку ниже, чтобы открыть Monvo."
            if ru else
            "🎉 Tayyor! Monvo ilovasini ochish uchun pastdagi tugmani bosing."
        ),
        "welcome_back": (
            "👋 С возвращением! Нажмите кнопку, чтобы открыть Monvo."
            if ru else
            "👋 Xush kelibsiz! Monvo ilovasini ochish uchun tugmani bosing."
        ),
        # Deep-link orqali merchant loyalty dasturiga qoʻshilganda ({merchant} = biznes nomi)
        "joined": (
            "🎉 Вы присоединились к программе лояльности <b>{merchant}</b>!\n"
            "Карта добавлена в Monvo — открывайте и собирайте бонусы."
            if ru else
            "🎉 Siz <b>{merchant}</b> sodiqlik dasturiga qoʻshildingiz!\n"
            "Karta Monvo'ga qoʻshildi — oching va bonus yigʻishni boshlang."
        ),
        "open_app": "💳 Открыть Monvo" if ru else "💳 Monvo'ni ochish",
        "no_app_url": (
            "⚠️ Приложение временно недоступно." if ru else "⚠️ Ilova vaqtincha mavjud emas."
        ),
    }


def _otp_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _parse_start_merchant(text: str) -> int | None:
    """Deep-link payload'dan merchant_id ni ajratadi.
    `/start m_123` yoki `/start m123` → 123. Aks holda None."""
    parts = (text or "").split(maxsplit=1)
    if len(parts) < 2:
        return None
    arg = parts[1].strip()
    if arg.startswith("m_"):
        arg = arg[2:]
    elif arg.startswith("m"):
        arg = arg[1:]
    else:
        return None
    return int(arg) if arg.isdigit() else None


async def _join_merchant_by_tg(tg_id: str, merchant_id: int) -> str | None:
    """telegram_id bo'yicha userni topib, shu merchant uchun loyalty karta
    ochadi (idempotent — karta bo'lsa qayta yaratmaydi). Merchant biznes nomini
    qaytaradi, topilmasa None. /cards/signup-by-merchant bilan bir xil mantiq."""
    import uuid as _uuid
    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import User, Merchant, Card
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.telegram_id == tg_id)
        )).scalar_one_or_none()
        if not user:
            return None
        merchant = (await db.execute(
            select(Merchant).where(Merchant.id == merchant_id)
        )).scalar_one_or_none()
        if not merchant or not getattr(merchant, "is_active", True):
            return None
        existing = (await db.execute(
            select(Card).where(Card.user_id == user.id, Card.merchant_id == merchant_id)
        )).scalar_one_or_none()
        if not existing:
            db.add(Card(
                merchant_id=merchant_id, user_id=user.id,
                card_uid=_uuid.uuid4().hex,
                holder_name=getattr(user, "name", "") or "",
                holder_phone=getattr(user, "phone", "") or "",
            ))
            await db.commit()
        return merchant.business_name


async def _send_open_app(
    message: "Message", lang: str, caption_key: str = "done", caption: str | None = None,
) -> None:
    """Brendlangan banner + caption + 'ilovani ochish' web_app tugmasi.
    `caption` berilsa — L[caption_key] o'rniga tayyor matn ishlatiladi (masalan
    merchant nomi bilan formatlangan qoʻshilish xabari)."""
    L = _L(lang)
    url = _webapp_url()
    text = caption if caption is not None else L[caption_key]
    if not url:
        await message.answer(L["no_app_url"])
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=L["open_app"], web_app=WebAppInfo(url=url)),
    ]])
    banner = (settings.FRONTEND_URL or "").rstrip("/") + "/tg/bot-banner.jpg"
    try:
        await message.answer_photo(photo=banner, caption=text, reply_markup=kb)
    except Exception as e:  # noqa: BLE001 — rasm yetib bormasa matnga tushamiz
        logger.warning(f"banner yuborilmadi: {e}")
        await message.answer(text, reply_markup=kb)


# Mini-app cache-bust: Telegram WebApp HTML'ни keshlaydi. Mini-app o'zgarганда
# bu raqamni oshiring — URL o'zgaradi, Telegram fresh yuklaydi (eski bundle qolmaydi).
_MINIAPP_VERSION = "20260619a"


def _webapp_url() -> str:
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if domain:
        return f"https://{domain}/tg/?v={_MINIAPP_VERSION}"
    base = (settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}/tg/?v={_MINIAPP_VERSION}" if base else ""


def _webhook_url(base_url: str) -> str:
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if domain:
        return f"https://{domain}/bot/webhook"
    return f"{base_url.rstrip('/')}/bot/webhook"


# ── Komanda handlerlari ───────────────────────────────────────────────────────

@tg.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()

    # Allaqachon ro'yxatdan o'tgan bo'lsa (telegram_id telefon-hisobga bog'langan)
    # — qayta til/telefon/OTP so'ramaymiz, to'g'ridan-to'g'ri ilovani ochamiz.
    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import User
    tg_id = str(message.from_user.id)
    # Bot foydalanuvchisini qayd qilamiz (admin paneldagi ro'yxat uchun) —
    # alohida sessiyada, user-read sessiyasini buzmaslik uchun.
    from core.bot_users import record_bot_user
    _u = message.from_user
    async with AsyncSessionLocal() as _bdb:
        await record_bot_user(
            _bdb, "customer", _u.id,
            username=_u.username or "", first_name=_u.first_name or "",
            last_name=_u.last_name or "", language_code=_u.language_code or "",
        )
    # Deep-link: `/start m_<merchant_id>` → skan qilingan merchant loyaltysiga qo'shilish
    pending_merchant = _parse_start_merchant(message.text or "")

    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.telegram_id == tg_id)
        )).scalar_one_or_none()
    if user and user.phone and user.is_active:
        lang = user.language or "uz"
        # Allaqachon ro'yxatda — agar deep-link bo'lsa darhol merchantga qo'shamiz.
        if pending_merchant:
            mname = await _join_merchant_by_tg(tg_id, pending_merchant)
            if mname:
                await _send_open_app(message, lang, caption=_L(lang)["joined"].format(merchant=mname))
                return
        await _send_open_app(message, lang, caption_key="welcome_back")
        return

    await state.set_state(Onboard.lang)
    # Ro'yxatdan o'tmagan — merchant_id ni saqlab qo'yamiz, OTP tasdiqlangach qo'shamiz.
    if pending_merchant:
        await state.update_data(pending_merchant=pending_merchant)
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🇺🇿 Oʻzbekcha", callback_data="lang:uz"),
        InlineKeyboardButton(text="🇷🇺 Русский", callback_data="lang:ru"),
    ]])
    await message.answer(
        "<b>Monvo</b> — loyalty kartalar platformasi.\n\n"
        "Tilni tanlang / Выберите язык:",
        reply_markup=kb,
    )


async def _ask_phone(message: "Message", lang: str):
    L = _L(lang)
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=L["share_btn"], request_contact=True)]],
        resize_keyboard=True, one_time_keyboard=True,
    )
    await message.answer(L["ask_phone"], reply_markup=kb)


@tg.callback_query(F.data.startswith("lang:"))
async def on_lang(cb, state: FSMContext):
    lang = "ru" if cb.data.endswith("ru") else "uz"
    await state.update_data(lang=lang)
    await state.set_state(Onboard.privacy)
    L = _L(lang)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass
    url = (settings.FRONTEND_URL or "https://monvo.uz").rstrip("/") + f"/privacy?lang={lang}"
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=L["agree"], callback_data="agree"),
    ]])
    await cb.message.answer(
        L["privacy"].format(url=url),
        reply_markup=kb,
        link_preview_options=LinkPreviewOptions(is_disabled=True),
    )
    await cb.answer()


@tg.callback_query(F.data == "agree", Onboard.privacy)
async def on_agree(cb, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "uz")
    await state.set_state(Onboard.phone)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass
    await _ask_phone(cb.message, lang)
    await cb.answer()


@tg.message(Onboard.phone, F.contact)
async def on_contact(message: Message, state: FSMContext):
    # Faqat foydalanuvchining O'Z raqami (boshqa kontaktni emas).
    c = message.contact
    if c.user_id and c.user_id != message.from_user.id:
        data = await state.get_data()
        await message.answer(_L(data.get("lang", "uz"))["bad_phone"])
        return
    await _handle_phone(message, state, c.phone_number)


@tg.message(Onboard.phone)
async def on_phone_text(message: Message, state: FSMContext):
    await _handle_phone(message, state, message.text or "")


async def _handle_phone(message: Message, state: FSMContext, raw_phone: str):
    # MUHIM: mobil ilova /auth/phone/* bilan bir xil normalizatsiya
    # (core.pos_engine.normalize_phone → "+998XXXXXXXXX"). Aks holda bot va
    # ilova bir xil telefon uchun ikki xil User yaratadi.
    from core.pos_engine import normalize_phone
    from core.sms import send_otp_sms
    data = await state.get_data()
    L = _L(data.get("lang", "uz"))

    phone = normalize_phone(raw_phone)
    if not phone:
        await message.answer(L["bad_phone"])
        return

    # Per-phone SMS rate-limit (auth/send-otp bilan bir xil himoya)
    from core.cache import rate_limit_incr
    if await rate_limit_incr(f"otp_send:{phone}", 300) > 3:
        await message.answer(L["sms_fail"], reply_markup=ReplyKeyboardRemove())
        return

    from sqlalchemy import delete
    from database import AsyncSessionLocal
    from models import PhoneOTP

    code = _otp_code()
    async with AsyncSessionLocal() as db:
        await db.execute(delete(PhoneOTP).where(PhoneOTP.phone == phone))
        db.add(PhoneOTP(
            phone=phone, code=code,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    # Kod Eskiz orqali SMS bo'lib FOYDALANUVCHI RAQAMIGA yuboriladi (kodni
    # chatda KO'RSATMAYMIZ — telefon egaligini tasdiqlash uchun).
    sent = await send_otp_sms(phone, code)
    if not sent and settings.APP_ENV.lower() == "production":
        logger.warning(f"OTP SMS yuborilmadi (Eskiz): {phone}")

    await state.update_data(phone=phone)
    await state.set_state(Onboard.code)
    await message.answer(
        L["code_sent"].format(phone=phone),
        reply_markup=ReplyKeyboardRemove(),
    )


@tg.message(Onboard.code)
async def on_code(message: Message, state: FSMContext):
    data = await state.get_data()
    L = _L(data.get("lang", "uz"))
    lang = data.get("lang", "uz")
    phone = data.get("phone")
    code = (message.text or "").strip()

    if not phone or not code.isdigit() or len(code) != 6:
        await message.answer(L["bad_code"])
        return

    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import PhoneOTP, User

    # OTP bypass O'CHIRILGAN — haqiqiy SMS OTP majburiy.
    test_bypass = False
    tg_id = str(message.from_user.id)

    async with AsyncSessionLocal() as db:
        if not test_bypass:
            otp = (await db.execute(
                select(PhoneOTP)
                .where(PhoneOTP.phone == phone, PhoneOTP.used.is_(False))
                .order_by(PhoneOTP.created_at.desc()).limit(1)
            )).scalar_one_or_none()
            now = datetime.now(timezone.utc)
            if (not otp or otp.code != code
                    or otp.expires_at.replace(tzinfo=timezone.utc) < now):
                await message.answer(L["bad_code"])
                return
            otp.used = True

        # Telefon bo'yicha user topiladi/yaratiladi va Telegram ID bog'lanadi.
        user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()

        # telegram_id UNIQUE — agar mini-app onboarding'gacha ochilib stub user
        # yaratgan bo'lsa, o'sha tg_id'ni egasidan bo'shatamiz (phone user'dan
        # boshqasi bo'lsa). Stub (telefoni yo'q, telegram provider) bo'lsa o'chiramiz.
        holders = (await db.execute(
            select(User).where(User.telegram_id == tg_id)
        )).scalars().all()
        for h in holders:
            if user is None or h.id != user.id:
                if not h.phone and h.auth_provider == "telegram":
                    await db.delete(h)
                else:
                    h.telegram_id = None
        await db.flush()

        if user is None:
            # is_active=True ni ANIQ beramiz: ustun default=True faqat commit
            # paytida qo'llanadi, db.add()dan keyin esa hali None bo'ladi —
            # tekshiruvni commit'dan oldin qilsak yangi user "bloklangan" ko'rinadi.
            user = User(
                name=message.from_user.first_name or phone,
                phone=phone, auth_provider="phone", language=lang,
                telegram_id=tg_id, is_active=True,
            )
            db.add(user)
        else:
            if not user.is_active:
                await message.answer(L["blocked"])
                await db.rollback()
                return
            user.telegram_id = tg_id
            user.language = lang
        await db.commit()

    await state.clear()

    # Deep-link orqali kelgan bo'lsa — endi merchant loyaltysiga qo'shamiz.
    pending_merchant = data.get("pending_merchant")
    if pending_merchant:
        mname = await _join_merchant_by_tg(tg_id, int(pending_merchant))
        if mname:
            await _send_open_app(message, lang, caption=_L(lang)["joined"].format(merchant=mname))
            return

    await _send_open_app(message, lang, caption_key="done")


@tg.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "📋 <b>Buyruqlar:</b>\n\n"
        "/start — Botni boshlash va ilovani ochish\n"
        "/help  — Yordam\n\n"
        "Savollar uchun: @monvo_support"
    )


@tg.message(Command("status"))
async def cmd_status(message: Message):
    await message.answer(
        f"✅ Bot ishlayapti\n"
        f"🌐 App URL: <code>{_webapp_url() or 'sozlanmagan'}</code>"
    )


# ── Lifecycle (FastAPI lifespan dan chaqiriladi) ──────────────────────────────

async def _load_token_from_db() -> str:
    """Read bot token from app_settings DB row. Empty string if not set."""
    try:
        from sqlalchemy import select
        from database import AsyncSessionLocal
        from models import AppSettings
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                select(AppSettings).where(AppSettings.id == 1)
            )).scalar_one_or_none()
            if row is None:
                return ""
            return (getattr(row, "telegram_bot_token", "") or "").strip()
    except Exception as e:
        logger.warning(f"bot token DB read xato: {e}")
        return ""


async def bot_init() -> bool:
    """Bot instance'ni yaratadi (token DB → .env). HAR worker'da chaqiriladi —
    chunki Telegram webhook'i istalgan worker'ga tushadi va `bot` mavjud
    bo'lishi shart (aks holda /bot/webhook 503 qaytaradi). Webhook'ni
    O'RNATMAYDI — buni faqat leader qiladi (flood'ni oldini olish uchun)."""
    global bot
    token = await _load_token_from_db()
    source = "DB"
    if not token:
        token = settings.TELEGRAM_BOT_TOKEN
        source = ".env"
    if not token:
        logger.warning("Telegram bot token yo'q (DB va .env bo'sh) — bot o'chirilgan")
        return False
    logger.info(f"Telegram bot token manbai: {source}")
    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    return True


async def bot_set_webhook(base_url: str) -> None:
    """Webhook'ni Telegram'ga o'rnatadi. FAQAT leader worker chaqiradi."""
    if not bot:
        return
    wh_url = _webhook_url(base_url)
    try:
        await bot.set_webhook(
            url=wh_url,
            allowed_updates=["message", "callback_query"],
            drop_pending_updates=False,  # restart paytida navbatdagi update'lar o'chmasin (yo'qolgan /start muammosi)
        )
        logger.success(f"✅ Telegram webhook: {wh_url}")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Webhook o'rnatilmadi: {e}")


async def bot_delete_webhook() -> None:
    """Webhook'ni Telegram'dan o'chiradi — bot update qabul qilmaydi (disable).
    Token va kod saqlanadi; qayta yoqish uchun bot_set_webhook chaqirilsa kifoya."""
    if not bot:
        return
    try:
        await bot.delete_webhook(drop_pending_updates=False)
        logger.warning("⛔ Telegram webhook o'chirildi — bot disable (TELEGRAM_BOT_ENABLED=false)")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Webhook o'chirilmadi: {e}")


async def bot_startup(base_url: str):
    """bot_init + bot_set_webhook (bot_reload uchun qulaylik)."""
    if await bot_init():
        await bot_set_webhook(base_url)


async def bot_shutdown():
    global bot
    if bot:
        # NB: intentionally do NOT delete_webhook() here. With multiple uvicorn
        # workers (and rolling redeploys) a shutting-down worker would otherwise
        # wipe the webhook a freshly-started worker just set, leaving the bot
        # silent until the next manual set. Startup re-sets the same URL
        # idempotently, so leaving the webhook in place is safe.
        await bot.session.close()
        bot = None
        logger.info("Telegram bot to'xtatildi (webhook saqlanib qoldi)")


async def bot_reload():
    """Restart bot using fresh token from DB. Called when admin updates settings."""
    await bot_shutdown()
    # Use current request base URL or settings.FRONTEND_URL for webhook
    base = settings.FRONTEND_URL or ""
    if not base:
        logger.warning("FRONTEND_URL bo'sh — bot reload skip")
        return
    await bot_startup(base)


# ── FastAPI endpoints ─────────────────────────────────────────────────────────

router = APIRouter(prefix="/bot", tags=["🤖 Telegram Bot"])


@router.post("/webhook")
async def telegram_webhook(request: Request):
    if not bot:
        return Response(status_code=503)
    try:
        body = await request.json()
        update = Update.model_validate(body)
        await dp.feed_update(bot=bot, update=update)
    except Exception as e:
        logger.warning(f"Webhook xato: {e}")
    return Response()


@router.get("/set-webhook")
async def set_webhook(request: Request):
    if not bot:
        return {"error": "Bot ishga tushmagan (TELEGRAM_BOT_TOKEN yo'q)"}
    wh_url = _webhook_url(str(request.base_url))
    try:
        await bot.set_webhook(
            url=wh_url,
            allowed_updates=["message", "callback_query"],
            drop_pending_updates=False,  # restart paytida navbatdagi update'lar o'chmasin (yo'qolgan /start muammosi)
        )
        info = await bot.get_webhook_info()
        return {"ok": True, "webhook_url": wh_url, "pending": info.pending_update_count}
    except Exception as e:
        return {"error": str(e)}


@router.get("/info")
async def bot_info():
    if not bot:
        return {"error": "Bot ishga tushmagan (TELEGRAM_BOT_TOKEN yo'q)"}
    try:
        me = await bot.get_me()
        wh = await bot.get_webhook_info()
        return {
            "bot": {"id": me.id, "username": me.username, "name": me.first_name},
            "webhook": {"url": wh.url, "pending": wh.pending_update_count, "last_error": wh.last_error_message},
            "webapp_url": _webapp_url(),
        }
    except Exception as e:
        return {"error": str(e)}


# ── Merchant "Telegram orqali qo'shilish" QR redirect ─────────────────────────
_bot_username_cache: str | None = None


async def _get_bot_username() -> str | None:
    """Bot username'ini get_me orqali olib keshlaydi (deep-link uchun)."""
    global _bot_username_cache
    if _bot_username_cache:
        return _bot_username_cache
    if bot is None:
        return None
    try:
        me = await bot.get_me()
        _bot_username_cache = me.username
    except Exception as e:  # noqa: BLE001
        logger.warning(f"get_me (username) xato: {e}")
        return None
    return _bot_username_cache


@router.get("/j/{merchant_id}")
async def join_redirect(merchant_id: int):
    """Merchant QR'i shu URL'ni kodlaydi (`/bot/j/<merchant_id>`). Skan qilingach
    Telegram botga `start=m_<id>` payload bilan yo'naltiradi → bot avtomatik
    shu merchant loyaltysiga qo'shadi."""
    from fastapi.responses import RedirectResponse
    username = await _get_bot_username()
    if not username:
        # Bot username topilmasa — ilovaga tushiramiz (fallback).
        return RedirectResponse(url=(settings.FRONTEND_URL or "https://monvo.uz"))
    return RedirectResponse(url=f"https://t.me/{username}?start=m_{merchant_id}")
