"""OpenAI integratsiyasi — AI chat funksiyalari uchun umumiy klient.

Ishlatilgan joylar:
  - routers/support_chat.py — landing page ochiq chat vidjeti
  - routers/ai_assistant.py — admin va merchant panellardagi to'liq ekranli
    AI yordamchi (xotirasi bazada saqlanadi)

Hujjat: https://platform.openai.com/docs/api-reference/chat
"""
from __future__ import annotations

from typing import Optional

import httpx

from config import settings

CHAT_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.OPENAI_API_KEY)


async def ask(
    message: str,
    history: Optional[list[dict]] = None,
    system_prompt: Optional[str] = None,
) -> str:
    """Bitta foydalanuvchi xabariga OpenAI javobini qaytaradi.

    history: [{"role": "user"|"assistant", "text": "..."}] — oxirgi xabarlar.
    system_prompt: bo'sh bo'lsa settings.OPENAI_SYSTEM_PROMPT (landing
    vidjeti uchun) ishlatiladi — admin/merchant yordamchisi o'z promptini
    yuboradi. Muvaffaqiyatsiz bo'lsa OpenAIError ko'taradi — chaqiruvchi
    (router) buni foydalanuvchiga qulay xabarga aylantiradi.
    """
    if not is_configured():
        raise OpenAIError("OPENAI_API_KEY not configured")

    messages = [{"role": "system", "content": system_prompt or settings.OPENAI_SYSTEM_PROMPT}]
    for h in (history or []):
        role = "assistant" if h.get("role") == "assistant" else "user"
        text = (h.get("text") or "").strip()
        if text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            CHAT_URL,
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.OPENAI_MODEL,
                "messages": messages,
                "temperature": 0.7,
            },
        )
        if resp.status_code != 200:
            raise OpenAIError(f"chat {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as e:
            raise OpenAIError(f"unexpected response shape: {e}") from e
