"""GigaChat (Sber) integratsiyasi — landing page AI chat vidjeti uchun.

Hujjat: https://developers.sber.ru/docs/ru/gigachat/api/overview
Oqim:
  1. POST {OAUTH_URL} — Basic {GIGACHAT_AUTH_KEY} bilan access_token olinadi
     (token ~30 daqiqa amal qiladi, xotirada keshlanadi)
  2. POST {CHAT_URL} — Bearer {access_token} bilan chat completion so'raladi

DIQQAT: Sber API'lari Mintsifry (rossiya) root CA sertifikati bilan ishlaydi —
u ko'pchilik standart trust store'da yo'q. Server ushbu CA'ni o'rnatmagan
bo'lsa GIGACHAT_VERIFY_SSL=false qiling (config.py orqali).
"""
from __future__ import annotations

import time
import uuid
from typing import Optional

import httpx
from loguru import logger

from config import settings

OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

_token: Optional[str] = None
_token_expires_at: float = 0.0


class GigaChatError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.GIGACHAT_AUTH_KEY)


async def _get_access_token(client: httpx.AsyncClient) -> str:
    global _token, _token_expires_at
    if _token and time.time() < _token_expires_at - 30:
        return _token

    resp = await client.post(
        OAUTH_URL,
        headers={
            "Authorization": f"Basic {settings.GIGACHAT_AUTH_KEY}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        data={"scope": settings.GIGACHAT_SCOPE},
    )
    if resp.status_code != 200:
        raise GigaChatError(f"oauth {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    _token = data["access_token"]
    # expires_at Sber tomonidan millisekundlarda qaytariladi
    _token_expires_at = data["expires_at"] / 1000
    return _token


async def ask(message: str, history: Optional[list[dict]] = None) -> str:
    """Bitta foydalanuvchi xabariga GigaChat javobini qaytaradi.

    history: [{"role": "user"|"assistant", "text": "..."}] — oxirgi ~10 xabar.
    Muvaffaqiyatsiz bo'lsa GigaChatError ko'taradi — chaqiruvchi (router)
    buni foydalanuvchiga qulay xabarga aylantiradi.
    """
    if not is_configured():
        raise GigaChatError("GIGACHAT_AUTH_KEY not configured")

    messages = [{"role": "system", "content": settings.GIGACHAT_SYSTEM_PROMPT}]
    for h in (history or []):
        role = "assistant" if h.get("role") == "assistant" else "user"
        text = (h.get("text") or "").strip()
        if text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(verify=settings.GIGACHAT_VERIFY_SSL, timeout=20.0) as client:
        token = await _get_access_token(client)
        resp = await client.post(
            CHAT_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "model": "GigaChat",
                "messages": messages,
                "temperature": 0.7,
                "n": 1,
            },
        )
        if resp.status_code != 200:
            raise GigaChatError(f"chat {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as e:
            raise GigaChatError(f"unexpected response shape: {e}") from e
