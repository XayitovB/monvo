"""OpenAI integratsiyasi — AI chat funksiyalari uchun umumiy klient.

Ishlatilgan joylar:
  - routers/support_chat.py — landing page ochiq chat vidjeti
  - routers/ai_assistant.py — admin va merchant panellardagi to'liq ekranli
    AI yordamchi (xotirasi bazada saqlanadi)

Hujjat: https://platform.openai.com/docs/api-reference/chat
"""
from __future__ import annotations

import json
from typing import Awaitable, Callable, Optional

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


ToolExecutor = Callable[[str, dict], Awaitable[str]]


async def ask_with_tools(
    message: str,
    history: Optional[list[dict]] = None,
    system_prompt: Optional[str] = None,
    tools: Optional[list[dict]] = None,
    tool_executor: Optional[ToolExecutor] = None,
    max_rounds: int = 4,
) -> str:
    """`ask()` bilan bir xil, lekin OpenAI function-calling (tools) qo'llab-quvvatlaydi.

    Model `tool_calls` qaytarsa, har birini `tool_executor(name, args)` orqali
    bajaradi (natija matn bo'lishi kerak), natijalarni suhbatga qo'shib modelni
    qayta chaqiradi — model to'liq matnli javob bergunga qadar (yoki
    max_rounds tugaguncha) davom etadi.
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

    async with httpx.AsyncClient(timeout=45.0) as client:
        for _ in range(max_rounds):
            payload = {
                "model": settings.OPENAI_MODEL,
                "messages": messages,
                "temperature": 0.4,
            }
            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"

            resp = await client.post(
                CHAT_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise OpenAIError(f"chat {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            try:
                msg = data["choices"][0]["message"]
            except (KeyError, IndexError, TypeError) as e:
                raise OpenAIError(f"unexpected response shape: {e}") from e

            tool_calls = msg.get("tool_calls")
            if not tool_calls:
                return (msg.get("content") or "").strip()

            messages.append(msg)
            for tc in tool_calls:
                fn = tc.get("function") or {}
                name = fn.get("name") or ""
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                if tool_executor:
                    try:
                        result = await tool_executor(name, args)
                    except Exception as e:  # noqa: BLE001
                        result = f"XATOLIK: funksiya ishlamadi — {type(e).__name__}: {e}"
                else:
                    result = "XATOLIK: tool_executor sozlanmagan"
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "content": str(result)[:8000],
                })

        return "Kechirasiz, so'rovingiz juda ko'p qadam talab qildi — birozroq aniqroq savol bering."
