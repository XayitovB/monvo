"""AI yordamchi — admin va merchant panellaridagi to'liq ekranli chat.

Ikkala rol bitta `ai_chat_messages` jadvalini owner_type/owner_key orqali
bo'lishadi (qarang: models.AiChatMessage). Har bir POST so'rovida oxirgi
xabarlar tarix sifatida OpenAI'ga yuboriladi, so'ng user+assistant
xabarlari bazaga yoziladi — shu bilan suhbat xotirasi sahifa yangilansa
yoki qayta kirilsa ham saqlanib qoladi.
"""
from fastapi import APIRouter, Depends, Request
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_merchant
from database import get_db
from integrations import openai_chat
from main import limiter
from models import AiChatMessage, Merchant

router = APIRouter(tags=["🤖 AI Assistant"])

_HISTORY_LIMIT = 20  # OpenAI'ga yuboriladigan oxirgi xabarlar soni
_PAGE_LIMIT = 200     # UI'ga qaytariladigan saqlangan xabarlar soni

_FALLBACK_UNCONFIGURED = "AI yordamchi hozircha sozlanmagan. Administratorga murojaat qiling."
_FALLBACK_ERROR = "Kechirasiz, hozir javob bera olmadim. Birozdan so'ng qayta urinib ko'ring."

_ADMIN_SYSTEM_PROMPT = (
    "Siz Monvo platformasining ichki admin paneli uchun AI yordamchisiz. "
    "Monvo — O'zbekistondagi QR loyalty-kartalar platformasi bo'lib, "
    "merchant (biznes)lar, foydalanuvchilar, tranzaksiyalar, tariflar, "
    "push-xabarlar, POS-integratsiyalar va analitika bilan ishlaydi. "
    "Administratorlarga platformani boshqarishda, ma'lumotlarni "
    "tushunishda, matn (masalan, push-xabar yoki e'lon matni) yozishda va "
    "umumiy savollariga yordam bering. Qisqa, aniq va professional javob "
    "bering. Foydalanuvchi qaysi tilda yozsa (o'zbek yoki rus), o'sha "
    "tilda javob bering."
)

_MERCHANT_SYSTEM_PROMPT = (
    "Siz Monvo platformasidagi biznes (merchant) egalari uchun AI "
    "yordamchisiz. Monvo — O'zbekistondagi QR loyalty-kartalar platformasi. "
    "Merchantlarga o'z loyallik dasturini sozlashda (ballar/keshbek "
    "qoidalari, mukofotlar), mijozlar bilan ishlashda (CRM, push-xabar "
    "matnlari), analitikani tushunishda va Monvo imkoniyatlaridan "
    "samarali foydalanishda maslahat bering. Qisqa, aniq va do'stona "
    "javob bering. Foydalanuvchi qaysi tilda yozsa (o'zbek yoki rus), "
    "o'sha tilda javob bering."
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
    db: AsyncSession, owner_type: str, owner_key: str, system_prompt: str, message: str
) -> AiChatMessage:
    history_rows = await _load_history(db, owner_type, owner_key, _HISTORY_LIMIT)
    history = [{"role": r.role, "text": r.content} for r in history_rows]

    db.add(AiChatMessage(owner_type=owner_type, owner_key=owner_key, role="user", content=message))

    if not openai_chat.is_configured():
        reply_text = _FALLBACK_UNCONFIGURED
    else:
        try:
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
    system_prompt = _ADMIN_SYSTEM_PROMPT + await _admin_stats_context(db)
    reply = await _handle_chat(db, "admin", owner_key, system_prompt, body.message.strip())
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
    reply = await _handle_chat(db, "merchant", owner_key, _MERCHANT_SYSTEM_PROMPT, body.message.strip())
    return _serialize(reply)


@router.delete("/merchant/ai-assistant/messages", summary="Merchant AI yordamchi — tarixni tozalash")
async def merchant_ai_clear(merchant: Merchant = Depends(get_current_merchant), db: AsyncSession = Depends(get_db)):
    owner_key = str(merchant.id)
    await db.execute(
        delete(AiChatMessage).where(AiChatMessage.owner_type == "merchant", AiChatMessage.owner_key == owner_key)
    )
    await db.commit()
    return {"ok": True}
