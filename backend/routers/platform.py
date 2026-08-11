"""
routers/platform.py
───────────────────
Platforma darajasidagi admin endpointlari:
  - Finance dashboard
  - Multi-admin (AdminUser CRUD + login)
  - Detailed health status
  - Audit log search + CSV export
"""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.dependencies import get_current_admin, require_admin_role
from core.security import create_admin_token, hash_password, verify_password
from database import AsyncSessionLocal, get_db
from models import AdminUser, AuditLog, Invoice, Merchant, Transaction, User

router = APIRouter(prefix="/admin", tags=["🛠️ Platform"])


# ═══ FINANCE ═════════════════════════════════════════════════════════════════
@router.get("/finance/overview", summary="Moliyaviy dashboard")
async def finance_overview(
    days: int = Query(30, ge=1, le=365),
    commission_pct: float = Query(0.0, ge=0, le=100),
    admin=Depends(require_admin_role("super_admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    """
    Platforma GMV (savdo hajmi), per-merchant revenue va komissiya hisobi.
    `commission_pct` — platformaning olaigan foizi (masalan 3%).
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    prev_since = since - timedelta(days=days)

    # Joriy davr GMV
    cur_gmv = float((await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= since,
            Transaction.tx_type == "earn",
        )
    )).scalar() or 0)

    prev_gmv = float((await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= prev_since,
            Transaction.created_at < since,
            Transaction.tx_type == "earn",
        )
    )).scalar() or 0)

    # Per-merchant top 20
    merchant_rows = (await db.execute(
        select(
            Merchant.id,
            Merchant.business_name,
            sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("gmv"),
            sa_func.count(Transaction.id).label("tx_count"),
        )
        .join(Transaction, Transaction.merchant_id == Merchant.id, isouter=True)
        .where(
            (Transaction.created_at >= since) | (Transaction.created_at.is_(None)),
            (Transaction.tx_type == "earn") | (Transaction.tx_type.is_(None)),
        )
        .group_by(Merchant.id, Merchant.business_name)
        .order_by(sa_func.coalesce(sa_func.sum(Transaction.amount), 0).desc())
        .limit(20)
    )).all()

    commission_factor = commission_pct / 100.0
    per_merchant = [
        {
            "merchant_id": r.id,
            "business_name": r.business_name,
            "gmv": float(r.gmv or 0),
            "tx_count": int(r.tx_count or 0),
            "commission": round(float(r.gmv or 0) * commission_factor, 2),
        }
        for r in merchant_rows
    ]

    # Oylik trend (so'nggi 12 oy)
    monthly_rows = (await db.execute(
        select(
            sa_func.date_trunc("month", Transaction.created_at).label("month"),
            sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("gmv"),
            sa_func.count(Transaction.id).label("cnt"),
        )
        .where(
            Transaction.created_at >= datetime.now(timezone.utc) - timedelta(days=365),
            Transaction.tx_type == "earn",
        )
        .group_by("month")
        .order_by("month")
    )).all()

    monthly_trend = [
        {
            "month": r.month.strftime("%Y-%m") if r.month else "",
            "gmv": float(r.gmv or 0),
            "tx_count": int(r.cnt or 0),
            "revenue": round(float(r.gmv or 0) * commission_factor, 2),
        }
        for r in monthly_rows
    ]

    # Invoice totals
    paid_total = float((await db.execute(
        select(sa_func.coalesce(sa_func.sum(Invoice.amount), 0))
        .where(Invoice.status == "paid", Invoice.paid_at >= since)
    )).scalar() or 0)

    pending_total = float((await db.execute(
        select(sa_func.coalesce(sa_func.sum(Invoice.amount), 0))
        .where(Invoice.status == "pending")
    )).scalar() or 0)

    def _pct(a, b):
        if b <= 0:
            return None
        return round((a - b) / b * 100, 1)

    return {
        "days_range": days,
        "commission_pct": commission_pct,
        "gmv": {
            "current": cur_gmv,
            "previous": prev_gmv,
            "change_pct": _pct(cur_gmv, prev_gmv),
        },
        "revenue": {
            "current": round(cur_gmv * commission_factor, 2),
            "previous": round(prev_gmv * commission_factor, 2),
        },
        "invoices": {"paid_in_range": paid_total, "pending_total": pending_total},
        "top_merchants": per_merchant,
        "monthly_trend": monthly_trend,
    }


# ═══ ADMIN USERS (multi-admin) ═══════════════════════════════════════════════
class _AdminUserIn(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=100)
    full_name: str = ""
    email: str = ""
    role: str = Field("support", pattern="^(super_admin|support|analyst|marketing)$")
    is_active: bool = True


class _AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(super_admin|support|analyst|marketing)$")
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=6, max_length=100)


class _AdminUserLogin(BaseModel):
    username: str
    password: str


@router.get("/admins", summary="Admin foydalanuvchilari")
async def list_admins(
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AdminUser).order_by(AdminUser.id.desc())
    )).scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in rows
    ]


@router.post("/admins", status_code=201, summary="Admin yaratish")
async def create_admin_user(
    body: _AdminUserIn,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(AdminUser).where(AdminUser.username == body.username.strip())
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Bu username band")

    u = AdminUser(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        email=body.email,
        role=body.role,
        is_active=body.is_active,
        created_by=str(admin.get("sub", "admin")),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    logger.success(f"Admin user yaratildi: {u.username} ({u.role})")
    return {"id": u.id}


@router.patch("/admins/{uid}", summary="Admin foydalanuvchini yangilash")
async def update_admin_user(
    uid: int,
    body: _AdminUserUpdate,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    u = (await db.execute(select(AdminUser).where(AdminUser.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Admin topilmadi")
    data = body.model_dump(exclude_unset=True)
    if "new_password" in data and data["new_password"]:
        u.password_hash = hash_password(data.pop("new_password"))
    else:
        data.pop("new_password", None)
    for k, v in data.items():
        if v is not None:
            setattr(u, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/admins/{uid}", summary="Admin o'chirish")
async def delete_admin_user(
    uid: int,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    u = (await db.execute(select(AdminUser).where(AdminUser.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Admin topilmadi")
    await db.delete(u)
    await db.commit()
    return {"ok": True}


@router.post("/admins/login", summary="Admin user login (multi-admin)")
async def admin_user_login(
    body: _AdminUserLogin,
    db: AsyncSession = Depends(get_db),
):
    """DB'dagi AdminUser orqali login. .env'dagi ADMIN_USERNAME bilan ham mos keladi."""
    u = (await db.execute(
        select(AdminUser).where(AdminUser.username == body.username.strip())
    )).scalar_one_or_none()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Login yoki parol noto'g'ri")
    if not u.is_active:
        raise HTTPException(403, "Akkaunt o'chirilgan")

    u.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    token = create_admin_token({
        "sub": str(u.id),
        "username": u.username,
        "admin_role": u.role,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "admin_id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "role": u.role,
    }


# ═══ HEALTH DETAILED ═════════════════════════════════════════════════════════
@router.get("/health/detailed", summary="Batafsil health (DB/Redis/FCM/SMTP/SMS)")
async def health_detailed(admin=Depends(get_current_admin)):
    import time
    from sqlalchemy import text as _text

    results: dict = {"checked_at": datetime.now(timezone.utc).isoformat()}

    # DB
    t0 = time.perf_counter()
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(_text("SELECT 1"))
        results["db"] = {"ok": True, "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        results["db"] = {"ok": False, "error": str(e)}

    # Redis
    if settings.REDIS_URL:
        t0 = time.perf_counter()
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.REDIS_URL)
            await r.ping()
            await r.aclose()
            results["redis"] = {"ok": True, "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}
        except Exception as e:
            results["redis"] = {"ok": False, "error": str(e)}
    else:
        results["redis"] = {"ok": False, "error": "REDIS_URL sozlanmagan"}

    # FCM
    try:
        from core.fcm import is_firebase_ready
        results["fcm"] = {"ok": bool(is_firebase_ready())}
    except Exception as e:
        results["fcm"] = {"ok": False, "error": str(e)}

    # SMTP
    try:
        smtp_host = getattr(settings, "SMTP_HOST", "")
        smtp_user = getattr(settings, "SMTP_USER", "")
        results["smtp"] = {
            "ok": bool(smtp_host and smtp_user),
            "host": smtp_host or None,
        }
    except Exception as e:
        results["smtp"] = {"ok": False, "error": str(e)}

    # SMS (Eskiz)
    try:
        eskiz_email = getattr(settings, "ESKIZ_EMAIL", "")
        eskiz_password = getattr(settings, "ESKIZ_PASSWORD", "")
        results["sms"] = {
            "ok": bool(eskiz_email and eskiz_password),
            "provider": "eskiz.uz" if eskiz_email else None,
        }
    except Exception as e:
        results["sms"] = {"ok": False, "error": str(e)}

    # Sentry
    results["sentry"] = {"ok": bool(getattr(settings, "SENTRY_DSN", ""))}

    all_ok = all(results[k].get("ok", False) for k in ("db", "fcm") if k in results)
    results["overall"] = "ok" if all_ok else "degraded"
    return results


# ═══ AUDIT LOG SEARCH + CSV ══════════════════════════════════════════════════
@router.get("/logs/search", summary="Audit log filterli qidiruv")
async def logs_search(
    user_id: Optional[int] = None,
    action: str = "",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(200, le=2000),
    offset: int = 0,
    admin=Depends(require_admin_role("super_admin", "support", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog, User).join(User, User.id == AuditLog.user_id, isouter=True)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action.strip():
        q = q.where(AuditLog.action.ilike(f"%{action.strip()}%"))
    if date_from:
        try:
            q = q.where(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except Exception:
            pass
    if date_to:
        try:
            q = q.where(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except Exception:
            pass

    total = (await db.execute(select(sa_func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(
        q.order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)
    )).all()

    return {
        "total": total,
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "user_name": u.name if u else None,
                "user_email": u.email if u else None,
                # Admin amallarida user_id=None, lekin actor bor ("admin:root")
                "actor": log.actor or None,
                "action": log.action,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            }
            for log, u in rows
        ],
    }


@router.get("/logs/export", summary="Audit log CSV eksport")
async def logs_export(
    user_id: Optional[int] = None,
    action: str = "",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    admin=Depends(require_admin_role("super_admin", "support")),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog, User).join(User, User.id == AuditLog.user_id, isouter=True)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action.strip():
        q = q.where(AuditLog.action.ilike(f"%{action.strip()}%"))
    if date_from:
        try:
            q = q.where(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except Exception:
            pass
    if date_to:
        try:
            q = q.where(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except Exception:
            pass

    rows = (await db.execute(q.order_by(AuditLog.timestamp.desc()).limit(10000))).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ID", "Sana", "Foydalanuvchi ID", "Ism", "Email", "Amal"])
    for log, u in rows:
        w.writerow([
            log.id,
            log.timestamp.isoformat() if log.timestamp else "",
            log.user_id,
            u.name if u else "",
            u.email if u else "",
            log.action,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-logs.csv"},
    )
