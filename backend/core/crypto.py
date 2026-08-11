"""
core/crypto.py
──────────────
Maxfiy ma'lumotlarni (POS kredensiallari, webhook secret'lari) bazada
shifrlangan holda saqlash uchun yordamchi modul.

Dizayn tamoyillari:
  - **Opt-in**: `ENCRYPTION_KEY` env o'rnatilmagan bo'lsa — shifrlash
    o'chiriladi (passthrough). Hech narsa buzilmaydi.
  - **Orqaga moslik**: eski (shifrlanmagan) qatorlar o'qishda avtomatik
    aniqlanadi va o'sha holicha qaytariladi. Migratsiya shart emas —
    keyingi yozuvda avtomatik shifrlanadi.
  - **Shaffof**: `EncryptedJSON` SQLAlchemy TypeDecorator JSON ustunini
    o'rnida saqlaydi, shuning uchun 30+ o'qish joyiga tegmaydi.

Kalit yaratish:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
from __future__ import annotations

from typing import Any, Optional

from loguru import logger
from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator

from config import settings

try:
    from cryptography.fernet import Fernet, InvalidToken
    _CRYPTO_AVAILABLE = True
except ImportError:  # pragma: no cover
    _CRYPTO_AVAILABLE = False
    InvalidToken = Exception  # type: ignore


_ENC_MARKER = "__enc__"  # shifrlangan qiymat shu kalit ostida saqlanadi


def _build_fernet() -> Optional["Fernet"]:
    key = (getattr(settings, "ENCRYPTION_KEY", "") or "").strip()
    if not key:
        return None
    if not _CRYPTO_AVAILABLE:
        logger.warning("ENCRYPTION_KEY o'rnatilgan, lekin `cryptography` yo'q — shifrlash o'chirildi")
        return None
    try:
        return Fernet(key.encode())
    except Exception as exc:  # noqa: BLE001 — noto'g'ri kalit servisni buzmasligi kerak
        logger.error(f"ENCRYPTION_KEY yaroqsiz Fernet kaliti emas — shifrlash o'chirildi ({exc})")
        return None


_fernet: Optional["Fernet"] = _build_fernet()


def encryption_enabled() -> bool:
    return _fernet is not None


def encrypt_str(plaintext: str) -> str:
    """Matnni shifrlaydi. Kalit yo'q bo'lsa o'zini qaytaradi."""
    if _fernet is None or plaintext is None:
        return plaintext
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_str(token: str) -> str:
    """Shifrlangan matnni ochadi. Ochib bo'lmasa (legacy plaintext) o'zini qaytaradi."""
    if _fernet is None or not token:
        return token
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):  # noqa: BLE001
        return token  # shifrlanmagan eski qiymat


class EncryptedJSON(TypeDecorator):
    """JSON ustunini bind paytida shifrlab, result paytida ochib beradigan tip.

    Fizik ustun turi JSON bo'lib qoladi (migratsiya shart emas). Shifrlangan
    qiymat `{"__enc__": "<fernet-token>"}` ko'rinishida saqlanadi.

    Kalit o'rnatilmagan bo'lsa — oddiy JSON kabi ishlaydi.
    """

    impl = JSON
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> Any:  # noqa: ANN001
        if value is None or _fernet is None:
            return value
        import json
        try:
            token = _fernet.encrypt(json.dumps(value, default=str).encode()).decode()
        except Exception as exc:  # noqa: BLE001
            logger.error(f"EncryptedJSON shifrlash xatosi — ochiq saqlanadi ({exc})")
            return value
        return {_ENC_MARKER: token}

    def process_result_value(self, value: Any, dialect) -> Any:  # noqa: ANN001
        if not isinstance(value, dict) or _ENC_MARKER not in value:
            return value  # legacy plaintext yoki None
        if _fernet is None:
            # Kalit yo'qolgan — ochib bo'lmaydi. Bo'sh dict qaytaramiz (xavfsiz).
            logger.error("Shifrlangan ma'lumot bor, lekin ENCRYPTION_KEY yo'q — o'qib bo'lmadi")
            return {}
        import json
        try:
            raw = _fernet.decrypt(value[_ENC_MARKER].encode()).decode()
            return json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            logger.error(f"EncryptedJSON ochish xatosi ({exc})")
            return {}
