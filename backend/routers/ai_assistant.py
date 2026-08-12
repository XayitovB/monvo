"""AI yordamchi — admin va merchant panellaridagi to'liq ekranli chat.

Ikkala rol bitta `ai_chat_messages` jadvalini owner_type/owner_key orqali
bo'lishadi (qarang: models.AiChatMessage). Har bir POST so'rovida oxirgi
xabarlar tarix sifatida OpenAI'ga yuboriladi, so'ng user+assistant
xabarlari bazaga yoziladi — shu bilan suhbat xotirasi sahifa yangilansa
yoki qayta kirilsa ham saqlanib qoladi.
"""
import json
import re

from fastapi import APIRouter, Depends, Request
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_merchant
from database import Base, get_db
from integrations import openai_chat
from main import limiter
from models import AiChatMessage, Merchant

router = APIRouter(tags=["🤖 AI Assistant"])

_HISTORY_LIMIT = 20  # OpenAI'ga yuboriladigan oxirgi xabarlar soni
_PAGE_LIMIT = 200     # UI'ga qaytariladigan saqlangan xabarlar soni
_SQL_TOOL_ROUND_LIMIT = 6  # bitta AI javobida nechta query_database chaqiruviga ruxsat (ask_with_tools max_rounds)

# Bazaga to'g'ridan-to'g'ri SELECT so'rov yuboradigan `query_database` tool
# uchun himoya qatlami: kredensial/parol saqlaydigan jadvallar va ustunlar
# to'liq berkitiladi — qolgan hammasi (merchant/mijoz/karta/tranzaksiya va h.k.)
# faqat o'qish uchun ochiq.
_SQL_BLOCKED_TABLES = {
    "admin_users", "password_reset_tokens", "pos_integrations",
    "merchant_api_tokens", "phone_otps", "merchant_webhooks",
}
_SQL_BLOCKED_COLUMNS = {"password_hash", "session_token", "secret", "credentials", "api_secret"}
_SQL_FORBIDDEN_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|"
    r"VACUUM|REINDEX|EXECUTE|CALL|MERGE|ATTACH|DETACH|LISTEN|NOTIFY|SET|RESET)\b",
    re.IGNORECASE,
)

_db_schema_cache: str | None = None


def _db_schema_description() -> str:
    """`jadval(ustun1, ustun2, ...)` ro'yxatini SQLAlchemy metadata'dan avtomatik quradi.

    Bloklangan jadvallar/ustunlar butunlay chiqarib tashlanadi — AI ularning
    borligini ham bilmaydi. Bir marta hisoblanib keshlanadi (schema runtime'da
    o'zgarmaydi)."""
    global _db_schema_cache
    if _db_schema_cache is not None:
        return _db_schema_cache
    lines = []
    for table in Base.metadata.sorted_tables:
        if table.name in _SQL_BLOCKED_TABLES:
            continue
        cols = [c.name for c in table.columns if c.name not in _SQL_BLOCKED_COLUMNS]
        lines.append(f"{table.name}({', '.join(cols)})")
    _db_schema_cache = "\n".join(lines)
    return _db_schema_cache


def _validate_readonly_sql(sql: str) -> str | None:
    """Xato bo'lsa foydalanuvchiga (aslida AI'ga) ko'rsatiladigan xabarni qaytaradi, aks holda None."""
    s = sql.strip().rstrip(";").strip()
    if not s:
        return "Bo'sh so'rov"
    if not re.match(r"^(SELECT|WITH)\b", s, re.IGNORECASE):
        return "Faqat SELECT (yoki WITH ... SELECT) so'rovlariga ruxsat berilgan"
    if ";" in s:
        return "Bitta so'rovdan ortiq (';') ruxsat etilmagan"
    if _SQL_FORBIDDEN_RE.search(s):
        return "Bu buyruq turi ruxsat etilmagan — faqat o'qish (SELECT)"
    for tbl in _SQL_BLOCKED_TABLES:
        if re.search(rf"\b{re.escape(tbl)}\b", s, re.IGNORECASE):
            return f"'{tbl}' jadvaliga kirish taqiqlangan"
    for col in _SQL_BLOCKED_COLUMNS:
        if re.search(rf"\b{re.escape(col)}\b", s, re.IGNORECASE):
            return f"'{col}' ustuniga kirish taqiqlangan"
    return None


async def _execute_readonly_query(db: AsyncSession, sql: str) -> str:
    """Validatsiyadan o'tgan SELECT'ni 50 qatorgacha cheklab, 3s timeout bilan bajaradi."""
    err = _validate_readonly_sql(sql)
    if err:
        return f"XATOLIK: {err}"

    inner = sql.strip().rstrip(";").strip()
    wrapped = f"SELECT * FROM ({inner}) AS _ai_sub LIMIT 50"
    try:
        await db.execute(sa_text("SET LOCAL statement_timeout = '3000'"))
        result = await db.execute(sa_text(wrapped))
        rows = result.mappings().all()
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        return f"XATOLIK: so'rov bajarilmadi — {type(e).__name__}: {str(e)[:200]}"

    if not rows:
        return "Natija topilmadi (0 qator)."
    return json.dumps([dict(r) for r in rows], ensure_ascii=False, default=str)[:6000]


_ADMIN_SQL_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": (
                "Monvo Postgres bazasidan faqat-o'qish (SELECT) so'rov bilan istalgan "
                "aniq ma'lumotni oladi — masalan barcha merchant nomlari, muayyan "
                "mijozlar ro'yxati, filtrlangan/guruhlangan hisob-kitoblar, so'nggi N ta "
                "yozuv. Natija avtomatik 50 qatorgacha cheklanadi."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "PostgreSQL SELECT (yoki WITH...SELECT) so'rovi. Faqat bitta buyruq, ';' ishlatmang.",
                    },
                },
                "required": ["sql"],
            },
        },
    },
]


def _admin_sql_tool_executor(db: AsyncSession) -> openai_chat.ToolExecutor:
    async def _exec(name: str, args: dict) -> str:
        if name != "query_database":
            return f"XATOLIK: noma'lum funksiya '{name}'"
        sql = (args.get("sql") or "").strip()
        if not sql:
            return "XATOLIK: 'sql' parametri bo'sh"
        return await _execute_readonly_query(db, sql)
    return _exec


def _admin_db_tool_instructions() -> str:
    return (
        "\n\n---\n"
        "MA'LUMOTLAR BAZASI (to'liq kirish): sizda `query_database` funksiyasi bor — "
        "u orqali quyidagi jadvallarning istalgan SELECT so'rovi bilan ANIQ ma'lumot "
        "olishingiz mumkin (masalan: barcha merchant nomlari, muayyan mijozning "
        "tranzaksiyalari, eng ko'p karta chiqargan biznes, so'nggi ro'yxatdan "
        "o'tganlar). Yuqoridagi tayyor statistikada yo'q HAR QANDAY savolga shu "
        "funksiya orqali javob bering — hech qachon \"ma'lumot yo'q\" demang, avval "
        "mos SELECT yozib sinab ko'ring. Faqat SELECT ishlaydi (yozish/o'chirish "
        "imkonsiz), natija 50 qatorgacha cheklangan.\n\n"
        "Jadvallar (ustunlar bilan):\n"
        f"{_db_schema_description()}"
    )

_FALLBACK_UNCONFIGURED = "AI yordamchi hozircha sozlanmagan. Administratorga murojaat qiling."
_FALLBACK_ERROR = "Kechirasiz, hozir javob bera olmadim. Birozdan so'ng qayta urinib ko'ring."

_CHART_INSTRUCTIONS = (
    "\n\n---\n"
    "GRAFIK CHIZISH QOIDASI: foydalanuvchi grafik/diagramma/chart/tendensiya "
    "so'rasa (masalan \"o'sish grafigini ko'rsat\", \"kunlik tranzaksiyalarni "
    "diagrammada ko'rsat\"), javobingizga albatta quyidagi formatda ```chart "
    "bilan boshlanuvchi bitta JSON blok qo'shing — faqat pastda berilgan "
    "haqiqiy kunlik ma'lumotlardan foydalaning, hech qachon raqam o'ylab "
    "topmang:\n"
    "```chart\n"
    "{\"type\": \"line\", \"title\": \"So'nggi 14 kun — yangi mijozlar\", "
    "\"labels\": [\"01 Avg\", \"02 Avg\"], \"series\": "
    "[{\"name\": \"Mijozlar\", \"data\": [3, 5]}]}\n"
    "```\n"
    "type — \"line\" yoki \"bar\". labels — X o'qi (sanalar). series — bir yoki "
    "bir nechta qator, har birida name va data (labels bilan bir xil uzunlikda "
    "sonlar massivi). JSON bloqdan oldin 1-2 gapli qisqa izoh yozing. Agar "
    "grafik uchun yetarli ma'lumot (masalan boshqa metrika) bo'lmasa, buni "
    "ochiq ayting va chart bloki qo'shmang."
)

_ANALYST_INSTRUCTIONS = (
    "\n\n---\n"
    "TAHLILCHI SIFATIDA ISHLANG: sizga berilgan raqamlarni faqat qaytarib "
    "aytib bermang — ularni SHARHLANG. \"Holat qanday\", \"biznes qanday "
    "ketyapti\", \"tahlil qil\" kabi umumiy so'rovlarga: (1) asosiy "
    "ko'rsatkichlarni ayting, (2) o'sish/pasayish tendensiyasini aniq "
    "belgilang (foiz bilan, agar mavjud bo'lsa), (3) diqqatga loyiq narsa "
    "bo'lsa (kuchli o'sish, tushkunlik, g'ayrioddiy raqam) alohida ta'kidlang, "
    "(4) agar o'rinli bo'lsa 1 ta amaliy tavsiya bering. 2-5 gapli, aniq va "
    "raqamlarga tayangan xulosa bilan yakunlang — umumiy gaplardan saqlaning."
)

_ADMIN_SYSTEM_PROMPT = (
    "Siz Monvo platformasining ichki admin paneli uchun AI yordamchisiz. "
    "Monvo — O'zbekistondagi QR loyalty-kartalar platformasi bo'lib, "
    "merchant (biznes)lar, foydalanuvchilar, tranzaksiyalar, tariflar, "
    "push-xabarlar, POS-integratsiyalar va analitika bilan ishlaydi. "
    "Administratorlarga platformani boshqarishda, ma'lumotlarni "
    "tushunishda va tahlil qilishda, matn (masalan, push-xabar yoki e'lon "
    "matni) yozishda va umumiy savollariga yordam bering. Qisqa, aniq va "
    "professional javob bering. Foydalanuvchi qaysi tilda yozsa (o'zbek "
    "yoki rus), o'sha tilda javob bering." + _ANALYST_INSTRUCTIONS + _CHART_INSTRUCTIONS
)

_MERCHANT_SYSTEM_PROMPT = (
    "Siz Monvo platformasidagi biznes (merchant) egalari uchun AI "
    "yordamchisiz. Monvo — O'zbekistondagi QR loyalty-kartalar platformasi. "
    "Merchantlarga o'z loyallik dasturini sozlashda (ballar/keshbek "
    "qoidalari, mukofotlar), mijozlar bilan ishlashda (CRM, push-xabar "
    "matnlari), biznes holatini tushunish va tahlil qilishda va Monvo "
    "imkoniyatlaridan samarali foydalanishda maslahat bering. Qisqa, aniq "
    "va do'stona javob bering. Foydalanuvchi qaysi tilda yozsa (o'zbek "
    "yoki rus), o'sha tilda javob bering." + _ANALYST_INSTRUCTIONS + _CHART_INSTRUCTIONS
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


async def _admin_stats_context(db: AsyncSession) -> str:
    """Dashboard'dagi bilan bir xil real-vaqt statistikasini matn ko'rinishida qaytaradi.

    /admin/stats endpointining o'zini (admin_analytics.py) qayta ishlatadi —
    shu bilan ikkala joyda bir xil raqamlar chiqishi kafolatlanadi. Xatolik
    bo'lsa bo'sh satr qaytaradi — chat statistikasiz ham ishlashda davom etadi.
    """
    try:
        from routers.admin_analytics import admin_stats
        s = await admin_stats(admin={}, db=db)
    except Exception as e:
        logger.warning(f"ai_assistant: stats fetch failed: {e}")
        return ""

    return (
        "\n\n---\n"
        "Joriy platforma statistikasi (bazadan real vaqtda olindi):\n"
        f"- Jami bizneslar (merchantlar): {s['total_merchants']} ta, shundan aktiv: {s['active_merchants']} ta\n"
        f"- Bugun qo'shilgan yangi bizneslar: {s['new_merchants_today']} ta\n"
        f"- Jami mijozlar: {s['total_users']} ta, shundan aktiv: {s['active_users']} ta, "
        f"nofaol: {s['inactive_users']} ta\n"
        f"- Bugun qo'shilgan yangi mijozlar: {s['new_users_today']} ta\n"
        f"- Ilova/webapp ochgan foydalanuvchilar — so'nggi 24 soat: {s['active_24h']}, "
        f"so'nggi 7 kun: {s['active_7d']}, so'nggi 30 kun: {s['active_30d']}\n"
        f"- Chiqarilgan kartalar: {s['total_cards']} ta, shundan aktiv: {s['active_cards']} ta\n"
        f"- Jami tranzaksiyalar: {s['total_transactions']} ta\n"
        f"- Berilgan ballar: {s['points_issued']}, ishlatilgan ballar: {s['points_redeemed']}\n"
        f"- Mukofotlar (rewards) soni: {s['total_rewards']} ta\n"
        "---\n"
        "Foydalanuvchi shu raqamlar haqida so'rasa yoki tahlil so'rasa (masalan "
        "o'sish, ulush, taqqoslash, xulosa), ANIQ shu ma'lumotlardan foydalaning. "
        "Agar so'ralgan narsa shu ro'yxatda bo'lmasa, buni ochiq ayting va "
        "taxmin qilmang — mos bo'limga (masalan Analitika, Moliya) yo'naltiring."
    )


async def _admin_timeseries_context(db: AsyncSession) -> str:
    """Grafik chizish uchun kunlik vaqt-qatori ma'lumotlarini matn ko'rinishida beradi.

    /admin/growth (so'nggi 14 kun: yangi mijoz/biznes) va /admin/chart-data
    (so'nggi 7 kun: tranzaksiyalar) endpointlarini qayta ishlatadi. Xatolik
    bo'lsa bo'sh satr qaytaradi.
    """
    try:
        from routers.admin_analytics import admin_chart_data, admin_growth
        growth = await admin_growth(days=14, date_from=None, date_to=None, single_date=None, admin={}, db=db)
        chart = await admin_chart_data(admin={}, db=db)
    except Exception as e:
        logger.warning(f"ai_assistant: timeseries fetch failed: {e}")
        return ""

    growth_lines = "\n".join(
        f"  {r['date']}: yangi mijozlar={r['new_users']}, yangi bizneslar={r['new_merchants']}"
        for r in growth["data"]
    )
    tx_lines = "\n".join(
        f"  {r['date']}: tranzaksiyalar={r['total']}"
        for r in chart["daily_transactions"]
    )
    return (
        "\n\n---\n"
        "Kunlik vaqt-qatori ma'lumotlari (grafik chizish uchun, bazadan real vaqtda olindi):\n"
        "So'nggi 14 kun — yangi mijozlar va bizneslar:\n"
        f"{growth_lines}\n"
        "So'nggi 7 kun — tranzaksiyalar soni:\n"
        f"{tx_lines}\n"
        "---"
    )


async def _merchant_stats_context(merchant: Merchant, db: AsyncSession) -> str:
    """Merchantning o'z KPI'larini (/merchants/stats bilan bir xil) matn ko'rinishida beradi."""
    try:
        from routers.merchants import merchant_stats
        s = await merchant_stats(merchant=merchant, db=db)
    except Exception as e:
        logger.warning(f"ai_assistant: merchant stats fetch failed: {e}")
        return ""

    return (
        "\n\n---\n"
        "Joriy biznes statistikasi (bazadan real vaqtda olindi):\n"
        f"- Jami kartalar: {s['cards_total']} ta, shundan aktiv: {s['cards_active']} ta\n"
        f"- Berilgan ballar: {s['points_issued']}, ishlatilgan ballar: {s['points_redeemed']}\n"
        f"- Aktiv mukofotlar soni: {s['active_rewards']} ta\n"
        "---\n"
        "Foydalanuvchi shu raqamlar haqida so'rasa yoki tahlil so'rasa, ANIQ shu "
        "ma'lumotlardan foydalaning. Agar so'ralgan narsa shu ro'yxatda bo'lmasa, "
        "buni ochiq ayting va taxmin qilmang."
    )


async def _merchant_timeseries_context(merchant: Merchant, db: AsyncSession) -> str:
    """Grafik chizish uchun kunlik vaqt-qatori (/merchants/analytics/trend, so'nggi 14 kun)."""
    try:
        from routers.merchants import analytics_trend
        trend = await analytics_trend(days=14, merchant=merchant, db=db)
    except Exception as e:
        logger.warning(f"ai_assistant: merchant timeseries fetch failed: {e}")
        return ""

    lines = "\n".join(
        f"  {r['date']}: ball ishlangan tranzaksiya={r['earn_count']} ta, "
        f"ishlatilgan tranzaksiya={r['redeem_count']} ta, "
        f"ishlangan ball={r['points_earned']}, ishlatilgan ball={r['points_redeemed']}"
        for r in trend["data"]
    )
    return (
        "\n\n---\n"
        "Kunlik vaqt-qatori ma'lumotlari (grafik chizish uchun, bazadan real vaqtda olindi):\n"
        "So'nggi 14 kun — ball ishlash/ishlatish tranzaksiyalari:\n"
        f"{lines}\n"
        "---"
    )


async def _merchant_overview_context(merchant: Merchant, db: AsyncSession) -> str:
    """Biznes holati — daromad/tranzaksiya o'sishi, retention/churn, LTV.

    /merchants/analytics/overview (so'nggi 30 kun, oldingi 30 kun bilan
    solishtirilgan) qayta ishlatiladi — aynan "biznesim qanday ketyapti"
    turdagi savollarga javob berish uchun eng muhim ko'rsatkichlar shu yerda."""
    try:
        from routers.merchant_analytics import m_overview
        o = await m_overview(days=30, merchant=merchant, db=db)
    except Exception as e:
        logger.warning(f"ai_assistant: merchant overview fetch failed: {e}")
        return ""

    def _fmt_pct(p):
        return "ma'lumot yo'q (oldingi davr bo'sh)" if p is None else f"{p:+.1f}%"

    return (
        "\n\n---\n"
        "Biznes holati — so'nggi 30 kun, undan oldingi 30 kun bilan "
        "solishtirilgan (bazadan real vaqtda olindi):\n"
        f"- Daromad: {o['revenue']['current']:.0f} so'm "
        f"(oldingi davr: {o['revenue']['previous']:.0f} so'm, o'zgarish: {_fmt_pct(o['revenue']['change_pct'])})\n"
        f"- Tranzaksiyalar: {o['transactions']['current']} ta "
        f"(oldingi: {o['transactions']['previous']} ta, o'zgarish: {_fmt_pct(o['transactions']['change_pct'])})\n"
        f"- Yangi kartalar (30 kun): {o['new_cards']} ta\n"
        f"- Faol mijozlar (30 kun): {o['active_customers']} ta\n"
        f"- Mijozni saqlab qolish (retention, 30 kun): {o['retention_30d']}%\n"
        f"- Yo'qotilgan mijozlar (churn, 90+ kun kelmagan): {o['churn_30d']}%\n"
        f"- O'rtacha mijoz qiymati (LTV): {o['avg_ltv']} so'm\n"
        "---"
    )


def _serialize(m: AiChatMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


async def _load_history(db: AsyncSession, owner_type: str, owner_key: str, limit: int) -> list[AiChatMessage]:
    result = await db.execute(
        select(AiChatMessage)
        .where(AiChatMessage.owner_type == owner_type, AiChatMessage.owner_key == owner_key)
        .order_by(AiChatMessage.created_at.desc())
        .limit(limit)
    )
    return list(reversed(result.scalars().all()))


async def _handle_chat(
    db: AsyncSession,
    owner_type: str,
    owner_key: str,
    system_prompt: str,
    message: str,
    tools: list[dict] | None = None,
    tool_executor: openai_chat.ToolExecutor | None = None,
) -> AiChatMessage:
    history_rows = await _load_history(db, owner_type, owner_key, _HISTORY_LIMIT)
    history = [{"role": r.role, "text": r.content} for r in history_rows]

    db.add(AiChatMessage(owner_type=owner_type, owner_key=owner_key, role="user", content=message))

    if not openai_chat.is_configured():
        reply_text = _FALLBACK_UNCONFIGURED
    else:
        try:
            if tools:
                reply_text = await openai_chat.ask_with_tools(
                    message, history=history, system_prompt=system_prompt,
                    tools=tools, tool_executor=tool_executor, max_rounds=_SQL_TOOL_ROUND_LIMIT,
                )
            else:
                reply_text = await openai_chat.ask(message, history=history, system_prompt=system_prompt)
        except openai_chat.OpenAIError as e:
            logger.warning(f"ai_assistant error ({owner_type}:{owner_key}): {e}")
            reply_text = _FALLBACK_ERROR

    assistant_msg = AiChatMessage(owner_type=owner_type, owner_key=owner_key, role="assistant", content=reply_text)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)
    return assistant_msg


# ── Admin ──────────────────────────────────────────────────────────────────
@router.get("/admin/ai-assistant/messages", summary="Admin AI yordamchi — suhbat tarixi")
async def admin_ai_messages(admin: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    owner_key = str(admin.get("sub"))
    rows = await _load_history(db, "admin", owner_key, _PAGE_LIMIT)
    return {"messages": [_serialize(m) for m in rows]}


@router.post("/admin/ai-assistant", summary="Admin AI yordamchi — xabar yuborish (OpenAI)")
@limiter.limit("20/minute")
async def admin_ai_chat(
    request: Request, body: ChatIn, admin: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    owner_key = str(admin.get("sub"))
    system_prompt = (
        _ADMIN_SYSTEM_PROMPT
        + await _admin_stats_context(db)
        + await _admin_timeseries_context(db)
        + _admin_db_tool_instructions()
    )
    reply = await _handle_chat(
        db, "admin", owner_key, system_prompt, body.message.strip(),
        tools=_ADMIN_SQL_TOOLS, tool_executor=_admin_sql_tool_executor(db),
    )
    return _serialize(reply)


@router.delete("/admin/ai-assistant/messages", summary="Admin AI yordamchi — tarixni tozalash")
async def admin_ai_clear(admin: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    owner_key = str(admin.get("sub"))
    await db.execute(
        delete(AiChatMessage).where(AiChatMessage.owner_type == "admin", AiChatMessage.owner_key == owner_key)
    )
    await db.commit()
    return {"ok": True}


# ── Merchant ───────────────────────────────────────────────────────────────
@router.get("/merchant/ai-assistant/messages", summary="Merchant AI yordamchi — suhbat tarixi")
async def merchant_ai_messages(
    merchant: Merchant = Depends(get_current_merchant), db: AsyncSession = Depends(get_db)
):
    owner_key = str(merchant.id)
    rows = await _load_history(db, "merchant", owner_key, _PAGE_LIMIT)
    return {"messages": [_serialize(m) for m in rows]}


@router.post("/merchant/ai-assistant", summary="Merchant AI yordamchi — xabar yuborish (OpenAI)")
@limiter.limit("20/minute")
async def merchant_ai_chat(
    request: Request,
    body: ChatIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    owner_key = str(merchant.id)
    system_prompt = (
        _MERCHANT_SYSTEM_PROMPT
        + await _merchant_stats_context(merchant, db)
        + await _merchant_overview_context(merchant, db)
        + await _merchant_timeseries_context(merchant, db)
    )
    reply = await _handle_chat(db, "merchant", owner_key, system_prompt, body.message.strip())
    return _serialize(reply)


@router.delete("/merchant/ai-assistant/messages", summary="Merchant AI yordamchi — tarixni tozalash")
async def merchant_ai_clear(merchant: Merchant = Depends(get_current_merchant), db: AsyncSession = Depends(get_db)):
    owner_key = str(merchant.id)
    await db.execute(
        delete(AiChatMessage).where(AiChatMessage.owner_type == "merchant", AiChatMessage.owner_key == owner_key)
    )
    await db.commit()
    return {"ok": True}
