"""
routers/admin_analytics.py
──────────────────────────
Platform analytics endpointlari.

  GET  /admin/stats
  GET  /admin/chart-data
  GET  /admin/growth
  GET  /admin/logs
  GET  /admin/retention
  GET  /admin/errors/setup
  GET  /admin/errors/issues
  GET  /admin/server-stats
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import Date, cast
from sqlalchemy import func as sa_func
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.dependencies import get_current_admin
from database import get_db
from models import AuditLog, Card, Merchant, Transaction, User

analytics_router = APIRouter(tags=["🔧 Admin"])


@analytics_router.get("/stats", summary="Platforma statistikasi")
async def admin_stats(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(sa_func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(
        select(sa_func.count(User.id)).where(User.is_active.is_(True))
    )).scalar() or 0

    total_merchants = (await db.execute(select(sa_func.count(Merchant.id)))).scalar() or 0
    active_merchants = (await db.execute(
        select(sa_func.count(Merchant.id)).where(Merchant.is_active.is_(True))
    )).scalar() or 0

    total_cards = (await db.execute(select(sa_func.count(Card.id)))).scalar() or 0
    active_cards = (await db.execute(
        select(sa_func.count(Card.id)).where(Card.is_active.is_(True))
    )).scalar() or 0

    from models import Reward
    total_rewards = (await db.execute(select(sa_func.count(Reward.id)))).scalar() or 0
    total_tx = (await db.execute(select(sa_func.count(Transaction.id)))).scalar() or 0

    points_issued = (await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0))
        .where(Transaction.tx_type == "earn")
    )).scalar() or 0
    points_redeemed = (await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0))
        .where(Transaction.tx_type == "redeem")
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    new_users_today = (await db.execute(
        select(sa_func.count(User.id)).where(User.created_at >= today)
    )).scalar() or 0
    new_merchants_today = (await db.execute(
        select(sa_func.count(Merchant.id)).where(Merchant.created_at >= today)
    )).scalar() or 0

    # ── Haqiqiy faollik: ilova (app_open) yoki webapp/mini-app (miniapp_open)
    # ochgan UNIKAL foydalanuvchilar. AuditLog'dan oynalar bo'yicha hisoblanadi.
    from datetime import timedelta as _td
    _ACTIVE_ACTIONS = ("miniapp_open", "app_open")

    async def _active_since(delta):
        return (await db.execute(
            select(sa_func.count(sa_func.distinct(AuditLog.user_id))).where(
                AuditLog.action.in_(_ACTIVE_ACTIONS),
                AuditLog.user_id.isnot(None),
                AuditLog.timestamp >= now - delta,
            )
        )).scalar() or 0

    active_24h = await _active_since(_td(hours=24))
    active_7d = await _active_since(_td(days=7))
    active_30d = await _active_since(_td(days=30))

    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users,
        # Haqiqiy faol (ilova/webapp ochgan) foydalanuvchilar
        "active_24h": active_24h,
        "active_7d": active_7d,
        "active_30d": active_30d,
        "total_merchants": total_merchants,
        "active_merchants": active_merchants,
        "total_cards": total_cards,
        "active_cards": active_cards,
        "total_rewards": total_rewards,
        "total_transactions": total_tx,
        "points_issued": int(points_issued),
        "points_redeemed": int(abs(points_redeemed)),
        "new_users_today": new_users_today,
        "new_merchants_today": new_merchants_today,
    }


@analytics_router.get("/chart-data", summary="Dashboard grafikasi")
async def admin_chart_data(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        now = datetime.now(timezone.utc)

        top_rows = (await db.execute(
            select(Merchant.business_name, sa_func.count(Card.id).label("total"))
            .join(Card, Card.merchant_id == Merchant.id, isouter=True)
            .group_by(Merchant.id, Merchant.business_name)
            .order_by(sa_func.count(Card.id).desc())
            .limit(5)
        )).all()
        top_merchants = [{"merchant": r.business_name, "cards": int(r.total or 0)} for r in top_rows]

        week_start = now - timedelta(days=6)
        tx_day = cast(Transaction.created_at, Date)
        daily_result = await db.execute(
            select(tx_day.label("day"), sa_func.count(Transaction.id).label("total"))
            .where(Transaction.created_at >= week_start)
            .group_by(tx_day)
            .order_by(tx_day)
        )
        daily_map = {row.day.strftime("%d %b"): int(row.total) for row in daily_result.all()}
        daily = []
        for i in range(6, -1, -1):
            day = now - timedelta(days=i)
            label = day.strftime("%d %b")
            daily.append({"date": label, "total": daily_map.get(label, 0)})

        return {"top_merchants": top_merchants, "daily_transactions": daily}
    except Exception as exc:
        logger.exception("admin/chart-data xato")
        raise HTTPException(500, f"{type(exc).__name__}: {exc}")


@analytics_router.get("/growth", summary="Kunlik o'sish: yangi userlar va merchantlar")
async def admin_growth(
    days: int | None = Query(None, ge=1, le=365),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    single_date: str | None = Query(None),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    if single_date:
        try:
            d = datetime.strptime(single_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "single_date formati: YYYY-MM-DD")
        start = d
        end = d + timedelta(days=1)
    elif date_from and date_to:
        try:
            start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "date_from/date_to formati: YYYY-MM-DD")
        if (end - start).days > 366:
            raise HTTPException(400, "Maksimal davr 365 kun")
    else:
        n = days or 7
        start = (now - timedelta(days=n - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(hour=23, minute=59, second=59, microsecond=0) + timedelta(seconds=1)

    try:
        user_day = cast(User.created_at, Date)
        user_rows = (await db.execute(
            select(user_day.label("day"), sa_func.count(User.id).label("cnt"))
            .where(User.created_at >= start, User.created_at < end)
            .group_by(user_day)
        )).all()
        user_map = {r.day: int(r.cnt) for r in user_rows}

        merchant_day = cast(Merchant.created_at, Date)
        merchant_rows = (await db.execute(
            select(merchant_day.label("day"), sa_func.count(Merchant.id).label("cnt"))
            .where(Merchant.created_at >= start, Merchant.created_at < end)
            .group_by(merchant_day)
        )).all()
        merchant_map = {r.day: int(r.cnt) for r in merchant_rows}

        result = []
        cur = start.replace(hour=0, minute=0, second=0, microsecond=0)
        while cur < end:
            d = cur.date()
            result.append({
                "date": d.strftime("%d %b"),
                "date_iso": d.isoformat(),
                "new_users": user_map.get(d, 0),
                "new_merchants": merchant_map.get(d, 0),
            })
            cur += timedelta(days=1)

        return {
            "data": result,
            "total_new_users": sum(r["new_users"] for r in result),
            "total_new_merchants": sum(r["new_merchants"] for r in result),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("admin/growth xato")
        raise HTTPException(500, f"{type(exc).__name__}: {exc}")


@analytics_router.get("/logs", summary="Audit loglar")
async def admin_get_logs(
    limit: int = Query(200, le=1000),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AuditLog, User.name, User.email)
        .join(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )).all()
    return [
        {
            "id": log.id,
            "user_name": name,
            "user_email": email,
            "action": log.action,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log, name, email in rows
    ]


@analytics_router.get("/retention", summary="Retention metrics")
async def retention(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    new_users = (await db.execute(_text(
        "SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"
    ))).scalar() or 0

    new_merchants = (await db.execute(_text(
        "SELECT COUNT(*) FROM merchants WHERE created_at >= NOW() - INTERVAL '30 days'"
    ))).scalar() or 0

    returning_r = await db.execute(_text("""
        SELECT COUNT(DISTINCT user_id) FROM audit_logs
        WHERE action = 'login' AND timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY user_id HAVING COUNT(*) >= 2
    """))
    returning = len(returning_r.fetchall())

    wau = (await db.execute(_text(
        "SELECT COUNT(DISTINCT card_id) FROM transactions WHERE created_at >= NOW() - INTERVAL '7 days'"
    ))).scalar() or 0

    mau = (await db.execute(_text(
        "SELECT COUNT(DISTINCT card_id) FROM transactions WHERE created_at >= NOW() - INTERVAL '30 days'"
    ))).scalar() or 0

    total_users = (await db.execute(_text("SELECT COUNT(*) FROM users"))).scalar() or 1

    activated = (await db.execute(_text(
        "SELECT COUNT(DISTINCT user_id) FROM cards WHERE user_id IS NOT NULL"
    ))).scalar() or 0

    return {
        "new_users_30d": new_users,
        "new_merchants_30d": new_merchants,
        "returning_30d": returning,
        "wau": wau,
        "mau": mau,
        "retention_rate": round(returning / max(total_users, 1) * 100, 1),
        "activation_rate": round(activated / max(total_users, 1) * 100, 1),
    }


@analytics_router.get("/errors/setup", summary="GlitchTip holati")
async def admin_errors_setup(admin=Depends(get_current_admin)):
    glitchtip_url = getattr(settings, "GLITCHTIP_URL", "")
    glitchtip_token = getattr(settings, "GLITCHTIP_TOKEN", "")
    return {
        "glitchtip_url": glitchtip_url or None,
        "configured": bool(glitchtip_url and glitchtip_token),
    }


@analytics_router.get("/errors/issues", summary="GlitchTip xatolari")
async def admin_errors_issues(
    limit: int = Query(25, ge=1, le=100),
    admin=Depends(get_current_admin),
):
    import httpx
    url = getattr(settings, "GLITCHTIP_URL", "").rstrip("/")
    token = getattr(settings, "GLITCHTIP_TOKEN", "")
    if not url or not token:
        return {"issues": [], "total": 0, "error": "GlitchTip sozlanmagan"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{url}/api/0/issues/",
                headers={"Authorization": f"Bearer {token}"},
                params={"limit": limit, "sort": "date"},
            )
            if resp.status_code == 200:
                issues = resp.json()
                return {
                    "issues": [
                        {
                            "id": i.get("id"),
                            "title": i.get("title", "Unknown"),
                            "culprit": i.get("culprit", ""),
                            "status": i.get("status", "unresolved"),
                            "level": i.get("level", "error"),
                            "count": i.get("count", 0),
                            "last_seen": i.get("lastSeen"),
                            "first_seen": i.get("firstSeen"),
                            "url": f"{url}/issues/{i.get('id')}" if i.get("id") else None,
                        }
                        for i in issues
                    ],
                    "total": len(issues),
                }
            return {"issues": [], "total": 0, "error": f"GlitchTip xato: {resp.status_code}"}
    except Exception as e:
        logger.warning(f"GlitchTip API xato: {e}")
        return {"issues": [], "total": 0, "error": str(e)}


@analytics_router.get("/server-stats", summary="Server nagruzka (CPU, RAM, disk)")
async def admin_server_stats(admin=Depends(get_current_admin)):
    import psutil, time

    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_count = psutil.cpu_count(logical=True)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot_time = psutil.boot_time()
    uptime_sec = int(time.time() - boot_time)

    net = psutil.net_io_counters()

    top_procs = []
    for p in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]),
                    key=lambda x: x.info.get("cpu_percent") or 0, reverse=True)[:5]:
        top_procs.append({
            "pid": p.info["pid"],
            "name": p.info["name"],
            "cpu_pct": round(p.info.get("cpu_percent") or 0, 1),
            "mem_pct": round(p.info.get("memory_percent") or 0, 1),
        })

    return {
        "cpu": {
            "percent": cpu_percent,
            "count": cpu_count,
        },
        "memory": {
            "total_mb": round(mem.total / 1024 / 1024),
            "used_mb": round(mem.used / 1024 / 1024),
            "free_mb": round(mem.available / 1024 / 1024),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / 1024 / 1024 / 1024, 1),
            "used_gb": round(disk.used / 1024 / 1024 / 1024, 1),
            "free_gb": round(disk.free / 1024 / 1024 / 1024, 1),
            "percent": disk.percent,
        },
        "network": {
            "bytes_sent_mb": round(net.bytes_sent / 1024 / 1024, 1),
            "bytes_recv_mb": round(net.bytes_recv / 1024 / 1024, 1),
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        },
        "uptime_sec": uptime_sec,
        "top_processes": top_procs,
    }
