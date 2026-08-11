"""
core/sms.py
───────────
Eskiz.uz orqali SMS yuborish (O'zbekiston).
SMS_ENABLED/creds bo'lmasa — kodni faqat logga yozadi (dev rejim).

  send_otp_sms(phone, code)        — bitta OTP SMS
  send_bulk_sms(items)             — rassilka (ko'p raqamga)
  normalize_uz_phone(raw)          — O'zbekiston raqamini validatsiya + normallashtirish
  get_sms_balance()                — Eskiz balans
"""
import asyncio
import re
import secrets
import string
import time
from typing import Iterable, Optional

import httpx
from loguru import logger

from config import settings

ESKIZ_BASE = "https://notify.eskiz.uz/api"

# O'zbekiston mobil operator prefikslari (998 dan keyingi 2 raqam)
_UZ_OPERATOR_CODES = {
    "20", "33", "50", "55", "77", "88", "90", "91",
    "93", "94", "95", "97", "98", "99",
}

# ── Token kesh (har yuborishda login qilmaslik uchun) ────────────────────────
_token_cache: dict[str, float | str] = {"token": "", "exp": 0.0}


def normalize_uz_phone(raw: Optional[str]) -> Optional[str]:
    """
    O'zbekiston raqamini tekshiradi va '998XXXXXXXXX' (12 raqam) ko'rinishiga
    keltiradi. Noto'g'ri bo'lsa None qaytaradi.

    Qabul qilinadi: +998901234567, 998901234567, 901234567, 90 123 45 67 ...
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return None
    # 9 xonali (operator+raqam) bo'lsa 998 qo'shamiz
    if len(digits) == 9:
        digits = "998" + digits
    # 12 xonali bo'lib 998 bilan boshlanmasa — noto'g'ri
    if len(digits) != 12 or not digits.startswith("998"):
        return None
    if digits[3:5] not in _UZ_OPERATOR_CODES:
        return None
    return digits


def _is_configured() -> bool:
    return bool(getattr(settings, "ESKIZ_EMAIL", "") and getattr(settings, "ESKIZ_PASSWORD", ""))


def generate_otp_code(length: int = 6) -> str:
    """Tasdiqlash kodi yaratadi.

    Eskiz hali ulanmagan bo'lsa (SMS haqiqatda yuborilmaydi) — doim "123456"
    (yoki so'ralgan uzunlikka kesilgan holati) qaytaradi, shunda foydalanuvchi
    server logiga qaramasdan kira oladi. Eskiz ulangach avtomatik tasodifiy
    kodga o'tadi.
    """
    if not _is_configured():
        return "123456"[:length]
    return "".join(secrets.choice(string.digits) for _ in range(length))


async def _get_token(client: httpx.AsyncClient, force: bool = False) -> Optional[str]:
    """Eskiz tokenini oladi (29 daqiqa keshlanadi)."""
    now = time.time()
    if not force and _token_cache["token"] and float(_token_cache["exp"]) > now:
        return str(_token_cache["token"])
    resp = await client.post(
        f"{ESKIZ_BASE}/auth/login",
        data={"email": settings.ESKIZ_EMAIL, "password": settings.ESKIZ_PASSWORD},
    )
    resp.raise_for_status()
    token = resp.json()["data"]["token"]
    _token_cache["token"] = token
    _token_cache["exp"] = now + 29 * 60  # Eskiz token ~30 daqiqa
    return token


async def _send_one(client: httpx.AsyncClient, token: str, phone: str, text: str) -> bool:
    resp = await client.post(
        f"{ESKIZ_BASE}/message/sms/send",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "mobile_phone": phone,
            "message": text,
            "from": getattr(settings, "ESKIZ_FROM", "4546"),
        },
    )
    if resp.status_code == 401:
        # token eskirgan — yangilab qayta urinamiz
        token = await _get_token(client, force=True)
        resp = await client.post(
            f"{ESKIZ_BASE}/message/sms/send",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "mobile_phone": phone,
                "message": text,
                "from": getattr(settings, "ESKIZ_FROM", "4546"),
            },
        )
    # MUHIM: Eskiz xatosini ko'rinadigan qilamiz — raise_for_status bo'sh xabar
    # qoldirardi. Endi to'liq javob (status + body) logga tushadi.
    if not resp.is_success:
        raise RuntimeError(f"Eskiz HTTP {resp.status_code}: {resp.text[:400]}")
    # Eskiz 200 qaytarsa ham body'da xato bo'lishi mumkin (status: error).
    try:
        j = resp.json()
        logger.info(f"Eskiz javobi ({phone}): {j}")
        if str(j.get("status", "")).lower() in ("error", "fail", "failed"):
            raise RuntimeError(f"Eskiz body xato: {j}")
    except ValueError:
        logger.info(f"Eskiz javobi ({phone}) [non-json]: {resp.text[:300]}")
    return True


async def send_otp_sms(phone: str, code: str) -> bool:
    """OTP kodni telefon raqamiga yuboradi. True = muvaffaqiyatli."""
    norm = normalize_uz_phone(phone)
    if not _is_configured():
        logger.warning(f"[DEV] SMS yuborilmadi. Telefon: {phone} | OTP: {code}")
        return True
    if not norm:
        logger.error(f"SMS: noto'g'ri raqam {phone}")
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token = await _get_token(client)
            # MUHIM: matn Eskiz'da TASDIQLANGAN shablonga aynan mos kelishi shart
            # (aks holda yuborilmaydi). Tasdiqlangan shablon:
            # "Monvo ilovasiga kirish uchun tasdiqlash kod: 0000. Kodni hech kimga bermang!"
            await _send_one(
                client, token, norm,
                f"Monvo ilovasiga kirish uchun tasdiqlash kod: {code}. "
                f"Kodni hech kimga bermang!",
            )
            logger.success(f"SMS yuborildi: {norm}")
            return True
    except Exception as e:
        logger.error(f"SMS xatosi ({phone}): {e}")
        return False


async def send_bulk_sms(items: Iterable[tuple[str, str]]) -> tuple[int, int, int]:
    """
    Rassilka — ko'p raqamga SMS.

    items: (phone, text) juftliklari ro'yxati. Telefon validatsiyasi shu yerda
    qilinadi (noto'g'ri raqamlar skip qilinadi va `invalid` sifatida sanaladi).

    Qaytaradi: (sent, failed, invalid)
    """
    # 1) Validatsiya — noto'g'ri raqamlarni ajratamiz
    valid: list[tuple[str, str]] = []
    invalid = 0
    for phone, text in items:
        norm = normalize_uz_phone(phone)
        if norm and text:
            valid.append((norm, text))
        else:
            invalid += 1

    if not valid:
        return 0, 0, invalid

    if not _is_configured():
        for norm, text in valid:
            logger.warning(f"[DEV] SMS rassilka skip: {norm} | {text[:40]}")
        return len(valid), 0, invalid

    sent = 0
    failed = 0
    sem = asyncio.Semaphore(8)  # Eskiz rate-limitiga yumshoq

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            token = await _get_token(client)
        except Exception as e:
            logger.error(f"SMS rassilka: token xatosi {e}")
            return 0, len(valid), invalid

        async def _worker(norm: str, text: str) -> bool:
            async with sem:
                try:
                    await _send_one(client, token, norm, text)
                    return True
                except Exception as e:
                    logger.warning(f"SMS rassilka xato ({norm}): {e}")
                    return False

        results = await asyncio.gather(*[_worker(n, t) for n, t in valid])
        sent = sum(1 for r in results if r)
        failed = len(results) - sent

    logger.info(f"SMS rassilka: sent={sent} failed={failed} invalid={invalid}")
    return sent, failed, invalid


async def get_sms_balance() -> Optional[int]:
    """Eskiz hisobidagi qolgan SMS limiti (None = aniqlanmadi)."""
    if not _is_configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token = await _get_token(client)
            resp = await client.get(
                f"{ESKIZ_BASE}/user/get-limit",
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json().get("data") or {}
            bal = data.get("balance")
            return int(bal) if bal is not None else None
    except Exception as e:
        logger.error(f"SMS balans xatosi: {e}")
        return None
