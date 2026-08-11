"""
core/fcm.py
───────────
Firebase Cloud Messaging (FCM) — init va multicast yuborish.
Singleton pattern: _firebase_initialized faqat bir marta.
"""
from __future__ import annotations
import asyncio
import os

from loguru import logger

from config import settings

_firebase_initialized: bool = False


def init_firebase() -> None:
    """Startup paytida bir marta chaqiriladi."""
    global _firebase_initialized
    if _firebase_initialized:
        return

    raw = settings.FIREBASE_SERVICE_ACCOUNT_JSON
    if not raw or not raw.strip():
        logger.warning("⚠️  FIREBASE_SERVICE_ACCOUNT_JSON sozlanmagan — Push o'chirilgan")
        return

    try:
        import json as _json
        import firebase_admin
        from firebase_admin import credentials

        # JSON kontent to'g'ridan-to'g'ri berilgan bo'lsa (Railway env var)
        if raw.strip().startswith("{"):
            cred = credentials.Certificate(_json.loads(raw))
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.success("✅ Firebase Admin SDK initialized (JSON content)")
        elif os.path.exists(raw):
            cred = credentials.Certificate(raw)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.success(f"✅ Firebase Admin SDK initialized: {raw}")
        else:
            logger.warning(f"⚠️  Firebase JSON topilmadi: {raw}")
    except Exception as exc:
        logger.warning(f"⚠️  Firebase init xatosi: {exc}")


def is_firebase_ready() -> bool:
    return _firebase_initialized


async def send_fcm_multicast(
    tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
    image: str = "",
) -> tuple[int, int]:
    """
    FCM Multicast yuborish.
    Returns (sent_count, failed_count).
    """
    if not _firebase_initialized or not tokens:
        return 0, len(tokens)

    # FIX #15: eksponensial backoff bilan 3 marta qayta urinish
    _MAX_RETRIES = 3
    last_exc: Exception | None = None
    img = (image or "").strip() or None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            from firebase_admin import messaging as fcm

            msg = fcm.MulticastMessage(
                tokens=tokens,
                notification=fcm.Notification(title=title, body=body, image=img),
                data={k: str(v) for k, v in (data or {}).items()},
                android=fcm.AndroidConfig(
                    priority="high",
                    notification=fcm.AndroidNotification(
                        color="#059669",
                        sound="default",
                        image=img,
                    ),
                ),
                apns=fcm.APNSConfig(
                    payload=fcm.APNSPayload(
                        aps=fcm.Aps(sound="default", badge=1,
                                    mutable_content=True if img else None),
                    ),
                    fcm_options=fcm.APNSFCMOptions(image=img) if img else None,
                ),
            )
            response = fcm.send_each_for_multicast(msg)
            logger.info(
                f"FCM sent={response.success_count} failed={response.failure_count}"
                + (f" (attempt {attempt})" if attempt > 1 else "")
            )
            # Har bir muvaffaqiyatsiz token uchun aniq xatoni log qilamiz
            # (iOS APNs muammosini topish uchun: token prefiksi + xato turi).
            if response.failure_count:
                for idx, resp in enumerate(response.responses):
                    if not resp.success:
                        tok = tokens[idx] if idx < len(tokens) else "?"
                        logger.warning(
                            f"FCM fail token={tok[:14]}… "
                            f"{type(resp.exception).__name__}: {resp.exception}"
                        )
            return response.success_count, response.failure_count

        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                wait = 2 ** (attempt - 1)   # 1s, 2s, 4s
                logger.warning(f"FCM urinish {attempt}/{_MAX_RETRIES} muvaffaqiyatsiz, {wait}s kutilmoqda: {exc}")
                await asyncio.sleep(wait)

    logger.error(f"FCM {_MAX_RETRIES} urinishdan keyin ham ishlamadi: {last_exc}")
    return 0, len(tokens)
