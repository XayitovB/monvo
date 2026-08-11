"""Landing page AI chat vidjeti — POST /support/chat.

Public endpoint (auth talab qilmaydi). GigaChat sozlanmagan yoki xatolik
bo'lsa ham 200 qaytaradi (ok=false + qulay xabar) — vidjet hech qachon
buzilib ko'rinmasligi kerak.
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from loguru import logger
from pydantic import BaseModel, Field

from integrations import gigachat
from main import limiter

router = APIRouter(tags=["💬 Support Chat"])

_FALLBACK_UZ = (
    "Kechirasiz, hozircha javob bera olmayapman. "
    "Savolingiz bo'lsa, support@monvo.uz ga yozing."
)


class ChatHistoryItem(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=2000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=10)


@router.post("/support/chat", summary="Landing chat vidjeti (GigaChat)")
@limiter.limit("15/minute")
async def support_chat(request: Request, body: ChatIn):
    if not gigachat.is_configured():
        return {"ok": False, "reply": _FALLBACK_UZ}

    try:
        reply = await gigachat.ask(
            body.message.strip(),
            history=[h.model_dump() for h in body.history],
        )
        return {"ok": True, "reply": reply}
    except gigachat.GigaChatError as e:
        logger.warning(f"gigachat error: {e}")
        return {"ok": False, "reply": _FALLBACK_UZ}
