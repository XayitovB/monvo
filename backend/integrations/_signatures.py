"""POS webhook signature verification.

Har bir provayder o'z signature sxemasidan foydalanadi. Bu modul barcha
qo'llab-quvvatlanadigan sxemalarni umumlashtiradi va `(provider, raw_body,
headers, credentials) -> bool` interfeysini taqdim etadi.

Tekshiruv constant-time `hmac.compare_digest` orqali bajariladi — timing
hujumlardan himoya.

**Strict rejim** (default): `webhook_secret` o'rnatilmagan bo'lsa, signature
tekshiruvi o'tib bo'lmaydi (`False`). Bu legacy integratsiyalarni ataylab
sindiradi — admin har bir POS integration uchun secret konfiguratsiya qilishi
kerak. Yangi connections odatda secret'ni avtomatik generatsiya qiladi.

Migratsiya rejimi: integration'ning `credentials.webhook_lax = true`
qiymati bilan eski integration'lar uchun grace period berish mumkin
(deploy bo'yicha ko'rib chiqish kerak).
"""
from __future__ import annotations

import base64
import hashlib
import hmac

from loguru import logger


def _ct_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _hex_hmac(key: str, body: bytes) -> str:
    return hmac.new(key.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _b64_hmac(key: str, body: bytes) -> str:
    return base64.b64encode(
        hmac.new(key.encode("utf-8"), body, hashlib.sha256).digest()
    ).decode("ascii")


def _verify_hmac_generic(
    raw_body: bytes,
    headers: dict[str, str],
    credentials: dict,
    *,
    sig_header_names: tuple[str, ...],
    provider: str,
) -> bool:
    """Hex yoki base64 HMAC-SHA256 imzosini tekshiruvchi umumiy yordamchi.

    Bir nechta header nomini tekshiradi (pastga tushirilgan), birinchi
    bo'sh bo'lmaganini oladi va sekret bilan body HMAC'ini constant-time
    solishtiradi.

    Strict rejim:
      - `webhook_secret` yo'q  → False (lax flag bilan grace berish mumkin)
      - signature header yo'q → False
      - sig mos kelmadi       → False
    """
    secret = (credentials.get("webhook_secret") or "").strip()
    if not secret:
        # Lax rejim — admin ataylab konfiguratsiya qilgan grace period
        if credentials.get("webhook_lax") is True:
            logger.warning(
                f"pos webhook: {provider} secret yo'q (lax rejim faol) — "
                f"strict rejimga o'tish uchun secret o'rnating"
            )
            return True
        logger.warning(
            f"pos webhook: {provider} `webhook_secret` o'rnatilmagan — "
            f"webhook rad etildi. Admin paneldan integration sozlamalarini tekshiring."
        )
        return False
    sig = ""
    for name in sig_header_names:
        v = headers.get(name) or headers.get(name.lower())
        if v:
            sig = str(v).strip()
            break
    if not sig:
        logger.warning(f"pos webhook: {provider} signature header topilmadi")
        return False
    # ba'zi provayderlar `sha256=<hex>` formatida yuboradi (GitHub uslubi)
    if sig.startswith("sha256="):
        sig = sig[7:]
    expected_hex = _hex_hmac(secret, raw_body)
    expected_b64 = _b64_hmac(secret, raw_body)
    return _ct_eq(sig, expected_hex) or _ct_eq(sig, expected_b64)


def verify_iiko(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    """iiko `X-Iiko-Signature` header'ini tekshiradi (HMAC-SHA256, hex/base64)."""
    return _verify_hmac_generic(
        raw_body, headers, credentials,
        sig_header_names=("x-iiko-signature", "X-Iiko-Signature", "x-signature"),
        provider="iiko",
    )


def verify_billz(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    """Billz `X-Billz-Signature` header'ini tekshiradi (HMAC-SHA256, hex/base64)."""
    return _verify_hmac_generic(
        raw_body, headers, credentials,
        sig_header_names=("x-billz-signature", "X-Billz-Signature", "x-signature"),
        provider="billz",
    )


def verify_yclients(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    return _verify_hmac_generic(
        raw_body, headers, credentials,
        sig_header_names=("x-yclients-signature", "x-signature"),
        provider="yclients",
    )


def verify_poster(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    return _verify_hmac_generic(
        raw_body, headers, credentials,
        sig_header_names=("x-poster-signature", "x-signature"),
        provider="poster",
    )


def verify_rkeeper(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    return _verify_hmac_generic(
        raw_body, headers, credentials,
        sig_header_names=("x-rkeeper-signature", "x-signature"),
        provider="rkeeper",
    )


def verify_alipos(raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    """ALIPOS auth — `clientId` + `clientSecret` headerlari (HMAC emas).

    ALIPOS hujjatlari (Order Status Webhook): "Так же в header будет идти
    clientId и clientSecret данного ресторана". Biz integratsiya yaratilganda
    bu ikki qiymatni `credentials.client_id` va `credentials.client_secret`
    da saqlaymiz va har webhook'da constant-time taqqoslaymiz.
    """
    expected_id = (credentials.get("client_id") or "").strip()
    expected_secret = (credentials.get("client_secret") or "").strip()
    if not expected_id or not expected_secret:
        if credentials.get("webhook_lax") is True:
            logger.warning("pos webhook: alipos credentials yo'q (lax rejim) — qabul qilindi")
            return True
        logger.warning("pos webhook: alipos `client_id` yoki `client_secret` o'rnatilmagan")
        return False

    # Header nomlarini case-insensitive tekshiramiz (lowercased headers map keladi
    # `pos_webhooks.py`'dan).
    incoming_id = ""
    incoming_secret = ""
    for name in ("clientid", "client-id", "x-client-id"):
        v = headers.get(name)
        if v:
            incoming_id = str(v).strip()
            break
    for name in ("clientsecret", "client-secret", "x-client-secret"):
        v = headers.get(name)
        if v:
            incoming_secret = str(v).strip()
            break

    if not incoming_id or not incoming_secret:
        logger.warning("pos webhook: alipos clientId yoki clientSecret header'i topilmadi")
        return False

    return _ct_eq(incoming_id, expected_id) and _ct_eq(incoming_secret, expected_secret)


_VERIFIERS = {
    "iiko": verify_iiko,
    "billz": verify_billz,
    "yclients": verify_yclients,
    "poster": verify_poster,
    "rkeeper": verify_rkeeper,
    "alipos": verify_alipos,
}


def verify(provider: str, raw_body: bytes, headers: dict[str, str], credentials: dict) -> bool:
    fn = _VERIFIERS.get(provider)
    if fn is None:
        # Noma'lum provayder uchun signature kerak emas (lekin faqat
        # whitelist'dagi provider'lar `pos_webhooks.py`da qabul qilinadi).
        logger.warning(f"pos webhook: provayder {provider!r} uchun signature verifier yo'q")
        return False
    return fn(raw_body, headers, credentials)
