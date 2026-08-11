"""
core/scheduler.py
─────────────────
APScheduler bilan kunlik push eslatmalari.

Monvo loyalty: cheksiz muddat davomida ishlatilmagan kartalar
(bo'sh o'tirgan ballar) egalariga "qaytib keling" eslatmasini yuboradi.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Card, FCMToken, PushNotificationLog

_scheduler: AsyncIOScheduler | None = None

_settings: dict[str, Any] = {
    "enabled": True,
    "hour": 18,
    "minute": 0,
    "dormant_days": 30,   # Oxirgi 30 kun ishlatilmagan kartalar
    "min_points": 50,     # Minimum ball (kam ballli kartalarga eslatma bermaymiz)
    "last_run": None,
    "last_sent": 0,
}


def get_settings() -> dict:
    return dict(_settings)


def update_settings(patch: dict) -> dict:
    for k, v in patch.items():
        if k in _settings:
            _settings[k] = v
    _reschedule()
    return get_settings()


def get_scheduler() -> AsyncIOScheduler | None:
    return _scheduler


async def _send_dormant_reminders():
    """Dormant (bo'sh turgan) kartalar egalariga push eslatma yuboradi."""
    from core.fcm import is_firebase_ready, send_fcm_multicast

    if not is_firebase_ready():
        logger.warning("Scheduler: Firebase tayyor emas")
        return

    _settings["last_run"] = datetime.now(timezone.utc).isoformat()
    cutoff = datetime.now(timezone.utc) - timedelta(days=_settings["dormant_days"])
    min_points = _settings["min_points"]

    async with AsyncSessionLocal() as db:
        cards_q = await db.execute(
            select(Card).where(
                Card.is_active.is_(True),
                Card.points >= min_points,
                (Card.last_used_at.is_(None)) | (Card.last_used_at < cutoff),
                Card.user_id.isnot(None),
            )
        )
        cards = cards_q.scalars().all()

        notified = 0
        for card in cards:
            tokens_q = await db.execute(
                select(FCMToken.token).where(FCMToken.user_id == card.user_id)
            )
            tokens = [r[0] for r in tokens_q.all()]
            if not tokens:
                continue
            title = "🎁 Sizning ballaringiz kutmoqda!"
            body = f"Kartangizda {card.points} ball bor — mukofotga almashtiring!"
            sent, _f = await send_fcm_multicast(
                tokens, title, body, {"type": "dormant_card", "card_uid": card.card_uid}
            )
            notified += sent

        if notified > 0:
            db.add(PushNotificationLog(
                title="Dormant card reminder",
                body=f"{_settings['dormant_days']} kun ishlatilmagan kartalarga",
                target="scheduled",
                sent_count=notified,
                sent_by="scheduler",
            ))
            await db.commit()

        _settings["last_sent"] = notified
        logger.info(f"Scheduler: {notified} ta dormant-card push")


async def _finalize_contests_job():
    """Hourly: mark expired contests as finished and award prizes."""
    from core.gamification import finalize_expired_contests
    try:
        async with AsyncSessionLocal() as db:
            count = await finalize_expired_contests(db)
            if count:
                logger.info(f"Scheduler: finalized {count} contests")
    except Exception as exc:
        logger.warning(f"Scheduler: contest finalization failed: {exc}")


async def _db_backup_job():
    """Har kuni 03:00 (Asia/Tashkent ≡ 22:00 UTC) DB backup'ni Telegram'ga yuboradi.

    `app_settings.telegram_bot_token` + `telegram_chat_id` to'ldirilgan
    bo'lishi shart. Aks holda no-op (logga warning).
    """
    try:
        from core.db_backup import notify_backup_failure, run_daily_backup
        async with AsyncSessionLocal() as db:
            ok, info = await run_daily_backup(db)
            if ok:
                logger.success(f"daily backup: {info}")
            elif info == "telegram_not_configured":
                logger.warning("daily backup: Telegram bot/chat sozlanmagan — skip")
            else:
                logger.error(f"daily backup FAILED: {info}")
                # Adminga alohida xabar (yiqilgan backup'ni ko'rmasligi mumkin)
                await notify_backup_failure(db, info)
    except Exception as exc:  # noqa: BLE001
        logger.error(f"daily backup exception: {exc}")


async def _webhook_retry_job():
    """Muvaffaqiyatsiz outbound webhooklarni backoff jadvaliga ko'ra qayta yuboradi."""
    try:
        from core.webhooks import retry_pending
        async with AsyncSessionLocal() as db:
            count = await retry_pending(db)
            if count:
                logger.info(f"Scheduler: webhook retry {count} ta delivery")
    except Exception as exc:
        logger.warning(f"Scheduler: webhook retry failed: {exc}")


async def _pos_polling_job():
    """Webhook tushib qolgan iiko cheklarni har 15 daq tortib olish."""
    try:
        from core.pos_polling import run_pos_polling
        summary = await run_pos_polling()
        if summary.get("iiko") or summary.get("errors"):
            logger.info(f"Scheduler: pos_polling {summary}")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Scheduler: pos polling failed: {exc}")


async def _cleanup_orphan_game_sessions():
    """Mark started game sessions older than 1h as 'abandoned'.

    Without this, a user who closes the app mid-game leaves status='started'
    forever, which counts toward their daily attempt cap. After 1h
    (well past any game's max_seconds) we declare them dead.
    """
    from datetime import timedelta
    from sqlalchemy import update
    from models import GameSession
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                update(GameSession)
                .where(
                    GameSession.status == "started",
                    GameSession.started_at < cutoff,
                )
                .values(status="abandoned")
            )
            await db.commit()
            if result.rowcount:
                logger.info(f"Scheduler: cleaned {result.rowcount} orphan game sessions")
    except Exception as exc:
        logger.warning(f"Scheduler: orphan cleanup failed: {exc}")


def _reschedule():
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job("dormant_card_reminder")
    except Exception:
        pass
    try:
        _scheduler.remove_job("contest_finalizer")
    except Exception:
        pass

    if _settings["enabled"]:
        _scheduler.add_job(
            _send_dormant_reminders,
            CronTrigger(hour=_settings["hour"], minute=_settings["minute"]),
            id="dormant_card_reminder",
            replace_existing=True,
        )
        logger.info(
            f"Scheduler: {_settings['hour']:02d}:{_settings['minute']:02d} UTC"
        )

    # Contest finalizer — har 15 daqiqada
    _scheduler.add_job(
        _finalize_contests_job,
        CronTrigger(minute="*/15"),
        id="contest_finalizer",
        replace_existing=True,
    )
    logger.info("Scheduler: contest finalizer har 15 daqiqada")

    # Orphan game session cleanup — har 30 daqiqada
    _scheduler.add_job(
        _cleanup_orphan_game_sessions,
        CronTrigger(minute="*/30"),
        id="game_orphan_cleanup",
        replace_existing=True,
    )
    logger.info("Scheduler: orphan game session cleanup har 30 daqiqada")

    # POS polling (iiko/billz) — har 1 daqiqada webhook tushib qolgan
    # cheklarni tortib oladi. Idempotency mavjud (unique provider+external_ref),
    # max_instances=1 + coalesce=True overlap'ni oldini oladi.
    _scheduler.add_job(
        _pos_polling_job,
        CronTrigger(minute="*"),
        id="pos_polling",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("Scheduler: pos polling har 1 daqiqada")

    # Daily DB backup — har kuni 03:00 Asia/Tashkent (22:00 UTC).
    # pg_dump → gzip → Telegram bot orqali admin chat'ga yuboriladi.
    _scheduler.add_job(
        _db_backup_job,
        CronTrigger(hour=22, minute=0),
        id="db_backup",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("Scheduler: daily DB backup 03:00 Asia/Tashkent (22:00 UTC)")

    # Outbound webhook retry — har 30 soniyada backoff muddati o'tgan deliverylarni qayta yuboradi
    _scheduler.add_job(
        _webhook_retry_job,
        CronTrigger(second="*/30"),
        id="webhook_retry",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("Scheduler: outbound webhook retry har 30 soniyada")


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _reschedule()
    _scheduler.start()
    logger.success("✅ Scheduler ishga tushdi")


def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    logger.info("Scheduler to'xtatildi")
