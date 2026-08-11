"""
routers/analytics.py
────────────────────
Kengaytirilgan admin analytics: heatmap, cohort, RFM segmentatsiya.

  GET /admin/analytics/heatmap  — haftakun × soat tranzaksiya matritsasi
  GET /admin/analytics/cohort   — haftalik cohort retention
  GET /admin/analytics/rfm      — RFM segmentatsiya (Recency, Frequency, Monetary)
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import func as sa_func
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from models import Transaction, User

router = APIRouter(prefix="/admin/analytics", tags=["📊 Analytics"])


# ── Heatmap ──────────────────────────────────────────────────────────────────
@router.get("/heatmap", summary="Haftakun × soat tranzaksiya heatmap")
async def analytics_heatmap(
    days: int = Query(30, ge=1, le=365),
    metric: str = Query("count", pattern="^(count|revenue|points)$"),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    7 × 24 matritsa qaytaradi (haftakun × soat).
    - metric=count   — tranzaksiyalar soni
    - metric=revenue — xarid summalari yig'indisi (earn bo'yicha)
    - metric=points  — berilgan ballar yig'indisi
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    if metric == "revenue":
        value_expr = sa_func.coalesce(sa_func.sum(Transaction.amount), 0)
        where_extra = (Transaction.tx_type == "earn",)
    elif metric == "points":
        value_expr = sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0)
        where_extra = (Transaction.tx_type == "earn",)
    else:
        value_expr = sa_func.count(Transaction.id)
        where_extra = tuple()

    dow = sa_func.extract("dow", Transaction.created_at)
    hour = sa_func.extract("hour", Transaction.created_at)

    q = (
        select(dow.label("dow"), hour.label("hour"), value_expr.label("val"))
        .where(Transaction.created_at >= since, *where_extra)
        .group_by(dow, hour)
    )
    try:
        rows = (await db.execute(q)).all()
    except Exception as e:
        logger.exception("heatmap xato")
        raise HTTPException(500, f"heatmap: {e}")

    # Postgres dow: 0=Sunday ... 6=Saturday. UI uchun Du=0 ... Ya=6 ga aylantiramiz.
    pg_to_mon = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}

    matrix = [[0 for _ in range(24)] for _ in range(7)]
    for r in rows:
        d = pg_to_mon.get(int(r.dow), 0)
        h = int(r.hour)
        if 0 <= h < 24:
            matrix[d][h] = float(r.val or 0)

    total = sum(sum(row) for row in matrix)
    peak_val = 0
    peak_day = 0
    peak_hour = 0
    for d in range(7):
        for h in range(24):
            if matrix[d][h] > peak_val:
                peak_val = matrix[d][h]
                peak_day = d
                peak_hour = h

    days_labels = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]
    return {
        "metric": metric,
        "days_range": days,
        "days_labels": days_labels,
        "hours": list(range(24)),
        "matrix": matrix,
        "total": total,
        "peak": {"day": days_labels[peak_day], "hour": peak_hour, "value": peak_val},
    }


# ── Cohort retention ─────────────────────────────────────────────────────────
@router.get("/cohort", summary="Haftalik cohort retention")
async def analytics_cohort(
    weeks: int = Query(8, ge=2, le=26),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Haftalik cohort retention matritsasi.
    Har bir cohort — ro'yxatdan o'tgan foydalanuvchilar guruhi (hafta bo'yicha).
    Satr: cohort, ustun: necha haftadan keyin qayta faol bo'lgan.
    "Faol" = shu haftada tranzaksiya qilgan (card orqali).
    """
    now = datetime.now(timezone.utc)
    # Joriy haftaning dushanbasi (UTC)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    cohort_start = start - timedelta(weeks=weeks - 1)

    # Har bir userning ro'yxatga olingan haftasi
    sql = _text("""
        WITH user_cohorts AS (
            SELECT
                u.id AS user_id,
                date_trunc('week', u.created_at)::date AS cohort_week
            FROM users u
            WHERE u.created_at >= :cohort_start
        ),
        user_activity AS (
            SELECT DISTINCT
                c.user_id,
                date_trunc('week', t.created_at)::date AS active_week
            FROM transactions t
            JOIN cards c ON c.id = t.card_id
            WHERE c.user_id IS NOT NULL
              AND t.created_at >= :cohort_start
        )
        SELECT
            uc.cohort_week,
            COUNT(DISTINCT uc.user_id) AS cohort_size,
            ua.active_week,
            COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.active_week IS NOT NULL) AS active
        FROM user_cohorts uc
        LEFT JOIN user_activity ua ON ua.user_id = uc.user_id
            AND ua.active_week >= uc.cohort_week
        GROUP BY uc.cohort_week, ua.active_week
        ORDER BY uc.cohort_week, ua.active_week
    """)

    try:
        rows = (await db.execute(sql, {"cohort_start": cohort_start})).all()
    except Exception as e:
        logger.exception("cohort xato")
        raise HTTPException(500, f"cohort: {e}")

    # Cohort -> {size, retention: {offset_week -> active}}
    cohorts: dict = {}
    for r in rows:
        cw = r.cohort_week
        if cw not in cohorts:
            cohorts[cw] = {"size": int(r.cohort_size), "retention": {}}
        if r.active_week is not None:
            offset = (r.active_week - cw).days // 7
            if 0 <= offset < weeks:
                cohorts[cw]["retention"][offset] = int(r.active or 0)

    # Chiqish strukturasi: cohort ro'yxati, har biri `values[i]` = foiz (0..100)
    result = []
    for i in range(weeks):
        cw = (cohort_start + timedelta(weeks=i)).date()
        info = cohorts.get(cw, {"size": 0, "retention": {}})
        size = info["size"] or 0
        values = []
        for offset in range(weeks):
            if i + offset >= weeks:
                values.append(None)  # kelajak — hali ma'lumot yo'q
                continue
            active = info["retention"].get(offset, 0)
            pct = round(active / size * 100, 1) if size > 0 else 0.0
            values.append(pct)
        result.append({
            "cohort": cw.isoformat(),
            "size": size,
            "values": values,
        })

    return {"weeks": weeks, "cohorts": result}


# ── RFM segmentatsiya ────────────────────────────────────────────────────────
@router.get("/rfm", summary="RFM segmentatsiya")
async def analytics_rfm(
    days: int = Query(180, ge=30, le=720),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    RFM = Recency (oxirgi tranzaksiyadan necha kun), Frequency (soni),
    Monetary (summa yig'indisi). Har biriga 1-5 ball, segmentlarga bo'linadi.

    Segmentlar:
      - Champions       (R≥4, F≥4, M≥4)
      - Loyal           (F≥4 or M≥4)
      - Potential       (R≥4, F<4)
      - At Risk         (R≤2, F≥3)
      - Hibernating     (R≤2, F≤2)
      - New             (R≥4, F=1)
      - Other           (qolganlar)
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    now = datetime.now(timezone.utc)

    sql = _text("""
        SELECT
            c.user_id,
            u.name,
            u.email,
            u.phone,
            MAX(t.created_at) AS last_tx,
            COUNT(t.id) AS freq,
            COALESCE(SUM(t.amount), 0) AS monetary
        FROM transactions t
        JOIN cards c ON c.id = t.card_id
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.user_id IS NOT NULL
          AND t.created_at >= :since
          AND t.tx_type = 'earn'
        GROUP BY c.user_id, u.name, u.email, u.phone
    """)

    try:
        rows = (await db.execute(sql, {"since": since})).all()
    except Exception as e:
        logger.exception("rfm xato")
        raise HTTPException(500, f"rfm: {e}")

    if not rows:
        return {
            "days_range": days,
            "users": [],
            "segments": {},
            "summary": {"total": 0, "avg_recency_days": 0, "avg_frequency": 0, "avg_monetary": 0},
        }

    # Quintile score (1..5) — har metrika bo'yicha
    recency_days = [(now - r.last_tx).days if r.last_tx else days for r in rows]
    frequencies = [int(r.freq or 0) for r in rows]
    monetaries = [float(r.monetary or 0) for r in rows]

    def quintile(values, reverse=False):
        """1-5 ball. reverse=True: kichik qiymat → yuqori ball (Recency uchun)."""
        sorted_vals = sorted(values, reverse=reverse)
        n = len(sorted_vals)
        if n == 0:
            return lambda _: 1
        # Chegaralar: 20%, 40%, 60%, 80%
        thresholds = [sorted_vals[int(n * p)] for p in (0.2, 0.4, 0.6, 0.8)]

        def score(v):
            if reverse:
                if v <= thresholds[0]: return 5
                if v <= thresholds[1]: return 4
                if v <= thresholds[2]: return 3
                if v <= thresholds[3]: return 2
                return 1
            else:
                if v >= thresholds[3]: return 5
                if v >= thresholds[2]: return 4
                if v >= thresholds[1]: return 3
                if v >= thresholds[0]: return 2
                return 1

        return score

    r_score = quintile(recency_days, reverse=True)
    f_score = quintile(frequencies)
    m_score = quintile(monetaries)

    def classify(r, f, m):
        if r >= 4 and f >= 4 and m >= 4:
            return "Champions"
        if f >= 4 or m >= 4:
            return "Loyal"
        if r >= 4 and f == 1:
            return "New"
        if r >= 4:
            return "Potential"
        if r <= 2 and f >= 3:
            return "At Risk"
        if r <= 2 and f <= 2:
            return "Hibernating"
        return "Other"

    segments: dict = {}
    users_out = []
    for row, rec_d, freq_v, mon_v in zip(rows, recency_days, frequencies, monetaries):
        r = r_score(rec_d)
        f = f_score(freq_v)
        m = m_score(mon_v)
        seg = classify(r, f, m)
        segments[seg] = segments.get(seg, 0) + 1
        users_out.append({
            "user_id": row.user_id,
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "recency_days": rec_d,
            "frequency": freq_v,
            "monetary": float(mon_v),
            "r": r, "f": f, "m": m,
            "segment": seg,
        })

    # Top 200 ni qaytaramiz (yuk past bo'lishi uchun)
    users_out.sort(key=lambda x: (x["r"] + x["f"] + x["m"]), reverse=True)

    return {
        "days_range": days,
        "summary": {
            "total": len(users_out),
            "avg_recency_days": round(sum(recency_days) / len(recency_days), 1),
            "avg_frequency": round(sum(frequencies) / len(frequencies), 2),
            "avg_monetary": round(sum(monetaries) / len(monetaries), 0),
        },
        "segments": segments,
        "users": users_out[:200],
    }
