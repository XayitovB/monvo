"""
routers/merchant_analytics.py
─────────────────────────────
Merchant o'zining do'koni uchun analytics:
  GET /merchants/me/analytics/overview   — umumiy KPI
  GET /merchants/me/analytics/heatmap    — haftakun × soat matritsasi
  GET /merchants/me/analytics/cohort     — haftalik cohort retention
  GET /merchants/me/analytics/rfm        — RFM segmentatsiya
  GET /merchants/me/analytics/rule-roi   — har loyalty qoida samaradorligi
  GET /merchants/me/reports/monthly      — oylik CSV hisobot
"""
import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
from sqlalchemy import func as sa_func
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from database import get_db
from models import Card, LoyaltyRule, Merchant, Transaction

router = APIRouter(prefix="/merchants/me", tags=["📈 Merchant Analytics"])


# ── Heatmap ──────────────────────────────────────────────────────────────────
@router.get("/analytics/heatmap", summary="Haftakun × soat heatmap (faqat shu merchant)")
async def m_heatmap(
    days: int = Query(30, ge=1, le=365),
    metric: str = Query("count", pattern="^(count|revenue|points)$"),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
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
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
            *where_extra,
        )
        .group_by(dow, hour)
    )
    rows = (await db.execute(q)).all()

    pg_to_mon = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
    matrix = [[0 for _ in range(24)] for _ in range(7)]
    for r in rows:
        d = pg_to_mon.get(int(r.dow), 0)
        h = int(r.hour)
        matrix[d][h] = float(r.val or 0)

    total = sum(sum(row) for row in matrix)
    peak_val = peak_day = peak_hour = 0
    for d in range(7):
        for h in range(24):
            if matrix[d][h] > peak_val:
                peak_val, peak_day, peak_hour = matrix[d][h], d, h

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
@router.get("/analytics/cohort", summary="Haftalik cohort retention (shu merchant kartalari)")
async def m_cohort(
    weeks: int = Query(8, ge=2, le=26),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    cohort_start = start - timedelta(weeks=weeks - 1)

    sql = _text("""
        WITH card_cohorts AS (
            SELECT
                c.id AS card_id,
                date_trunc('week', c.issued_at)::date AS cohort_week
            FROM cards c
            WHERE c.merchant_id = :mid AND c.issued_at >= :cohort_start
        ),
        card_activity AS (
            SELECT DISTINCT
                t.card_id,
                date_trunc('week', t.created_at)::date AS active_week
            FROM transactions t
            WHERE t.merchant_id = :mid AND t.created_at >= :cohort_start
        )
        SELECT
            cc.cohort_week,
            COUNT(DISTINCT cc.card_id) AS cohort_size,
            ca.active_week,
            COUNT(DISTINCT cc.card_id) FILTER (WHERE ca.active_week IS NOT NULL) AS active
        FROM card_cohorts cc
        LEFT JOIN card_activity ca ON ca.card_id = cc.card_id
            AND ca.active_week >= cc.cohort_week
        GROUP BY cc.cohort_week, ca.active_week
        ORDER BY cc.cohort_week, ca.active_week
    """)

    rows = (await db.execute(sql, {"mid": merchant.id, "cohort_start": cohort_start})).all()

    cohorts: dict = {}
    for r in rows:
        cw = r.cohort_week
        if cw not in cohorts:
            cohorts[cw] = {"size": int(r.cohort_size), "retention": {}}
        if r.active_week is not None:
            offset = (r.active_week - cw).days // 7
            if 0 <= offset < weeks:
                cohorts[cw]["retention"][offset] = int(r.active or 0)

    result = []
    for i in range(weeks):
        cw = (cohort_start + timedelta(weeks=i)).date()
        info = cohorts.get(cw, {"size": 0, "retention": {}})
        size = info["size"] or 0
        values = []
        for offset in range(weeks):
            if i + offset >= weeks:
                values.append(None)
                continue
            active = info["retention"].get(offset, 0)
            pct = round(active / size * 100, 1) if size > 0 else 0.0
            values.append(pct)
        result.append({"cohort": cw.isoformat(), "size": size, "values": values})

    return {"weeks": weeks, "cohorts": result}


# ── RFM ──────────────────────────────────────────────────────────────────────
@router.get("/analytics/rfm", summary="RFM segmentatsiya (shu merchant mijozlari)")
async def m_rfm(
    days: int = Query(180, ge=30, le=720),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_ as _or
    since = datetime.now(timezone.utc) - timedelta(days=days)
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)
    d90 = now - timedelta(days=90)

    # KPI queries
    total_points = (await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0))
        .where(Transaction.merchant_id == merchant.id, Transaction.created_at >= since, Transaction.tx_type == "earn")
    )).scalar() or 0

    active_count = (await db.execute(
        select(sa_func.count(sa_func.distinct(Transaction.card_id)))
        .where(Transaction.merchant_id == merchant.id, Transaction.created_at >= d30)
    )).scalar() or 0

    total_cards = (await db.execute(
        select(sa_func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    )).scalar() or 0

    churned_count = (await db.execute(
        select(sa_func.count(Card.id))
        .where(
            Card.merchant_id == merchant.id,
            Card.is_active.is_(True),
            _or(Card.last_used_at < d90, Card.last_used_at.is_(None)),
        )
    )).scalar() or 0

    retention_30d = round(active_count / total_cards * 100, 1) if total_cards else None
    churn_rate = round(churned_count / total_cards * 100, 1) if total_cards else None

    sql = _text("""
        SELECT
            c.id AS card_id,
            c.holder_name,
            c.holder_phone,
            c.tier,
            MAX(t.created_at) AS last_tx,
            COUNT(t.id) AS freq,
            COALESCE(SUM(t.amount), 0) AS monetary
        FROM transactions t
        JOIN cards c ON c.id = t.card_id
        WHERE t.merchant_id = :mid
          AND t.created_at >= :since
          AND t.tx_type = 'earn'
        GROUP BY c.id, c.holder_name, c.holder_phone, c.tier
    """)

    rows = (await db.execute(sql, {"mid": merchant.id, "since": since})).all()
    if not rows:
        return {
            "days_range": days,
            "total_points": int(total_points),
            "active_count": int(active_count),
            "avg_ltv": 0.0,
            "retention_30d": retention_30d,
            "churn_rate": churn_rate,
            "segments": {"champions": 0, "loyal": 0, "at_risk": 0, "lost": 0, "new": 0},
            "summary": {"total": 0},
            "users": [],
        }

    recency = [(now - r.last_tx).days if r.last_tx else days for r in rows]
    freqs = [int(r.freq or 0) for r in rows]
    monetaries = [float(r.monetary or 0) for r in rows]
    avg_ltv = round(sum(monetaries) / len(monetaries), 0) if monetaries else 0.0

    def quintile(vals, reverse=False):
        sv = sorted(vals, reverse=reverse)
        n = len(sv)
        if n == 0:
            return lambda _: 1
        thresholds = [sv[int(n * p)] for p in (0.2, 0.4, 0.6, 0.8)]

        def score(v):
            if reverse:
                for i, t in enumerate(thresholds):
                    if v <= t:
                        return 5 - i
                return 1
            for i, t in enumerate(reversed(thresholds)):
                if v >= t:
                    return 5 - i
            return 1
        return score

    r_sc = quintile(recency, reverse=True)
    f_sc = quintile(freqs)
    m_sc = quintile(monetaries)

    def seg(r, f, m):
        if r >= 4 and f >= 4 and m >= 4: return "champions"
        if f >= 4 or m >= 4: return "loyal"
        if r >= 4 and f == 1: return "new"
        if r >= 4: return "loyal"
        if r <= 2 and f >= 3: return "at_risk"
        if r <= 2: return "lost"
        return "loyal"

    segments: dict = {}
    out = []
    for row, rd, fv, mv in zip(rows, recency, freqs, monetaries):
        r, f, m = r_sc(rd), f_sc(fv), m_sc(mv)
        s = seg(r, f, m)
        segments[s] = segments.get(s, 0) + 1
        out.append({
            "card_id": row.card_id,
            "holder_name": row.holder_name,
            "holder_phone": row.holder_phone,
            "tier": row.tier,
            "recency_days": rd,
            "frequency": fv,
            "monetary": float(mv),
            "r": r, "f": f, "m": m,
            "segment": s,
        })

    out.sort(key=lambda x: (x["r"] + x["f"] + x["m"]), reverse=True)
    return {
        "days_range": days,
        "total_points": int(total_points),
        "active_count": int(active_count),
        "avg_ltv": float(avg_ltv),
        "retention_30d": retention_30d,
        "churn_rate": churn_rate,
        "segments": {
            "champions": segments.get("champions", 0),
            "loyal": segments.get("loyal", 0),
            "at_risk": segments.get("at_risk", 0),
            "lost": segments.get("lost", 0),
            "new": segments.get("new", 0),
        },
        "summary": {
            "total": len(out),
            "avg_recency_days": round(sum(recency) / len(recency), 1),
            "avg_frequency": round(sum(freqs) / len(freqs), 2),
            "avg_monetary": float(avg_ltv),
        },
        "users": out[:200],
    }


# ── Qoida ROI ────────────────────────────────────────────────────────────────
@router.get("/analytics/rule-roi", summary="Loyalty qoidalar samaradorligi (ROI)")
async def m_rule_roi(
    days: int = Query(30, ge=1, le=365),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """
    Har bir LoyaltyRule bo'yicha qancha tranzaksiya uni qo'zg'atganini va
    qancha ball berganini baholaydi. Note maydonidan heuristic qidiramiz.

    Note: aniq rule-tracking uchun Transaction.applied_rules JSON qo'shish kerak.
    MVP darajasida — quyidagi taxminlar:
      - punch_card / spend_threshold: note'da "🎁" bor
      - happy_hour: note'da "Happy hour" bor
      - birthday_bonus: note'da "🎂" bor
      - classic/cashback: qolgani
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rules = (await db.execute(
        select(LoyaltyRule).where(LoyaltyRule.merchant_id == merchant.id)
    )).scalars().all()

    # Umumiy tx stats
    totals = (await db.execute(
        select(
            sa_func.count(Transaction.id).label("cnt"),
            sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("revenue"),
            sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0).label("points"),
        ).where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
            Transaction.tx_type == "earn",
        )
    )).first()

    total_tx = int(totals.cnt or 0)
    total_rev = float(totals.revenue or 0)
    total_pts = int(totals.points or 0)

    # "Maxsus sovg'a berilgan" tranzaksiyalar
    special_cnt = (await db.execute(
        select(sa_func.count(Transaction.id))
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
            Transaction.note.ilike("%🎁%"),
        )
    )).scalar() or 0

    birthday_cnt = (await db.execute(
        select(sa_func.count(Transaction.id))
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
            Transaction.note.ilike("%🎂%"),
        )
    )).scalar() or 0

    rules_out = []
    for r in rules:
        est_triggered = 0
        if r.rule_type in ("punch_card", "spend_threshold"):
            est_triggered = int(special_cnt)
        elif r.rule_type == "birthday_bonus":
            est_triggered = int(birthday_cnt)
        rules_out.append({
            "id": r.id,
            "name": r.name,
            "rule_type": r.rule_type,
            "is_active": r.is_active,
            "priority": r.priority,
            "estimated_triggered": est_triggered,
            "config": r.config,
        })

    return {
        "days_range": days,
        "totals": {
            "transactions": total_tx,
            "revenue": total_rev,
            "points_issued": total_pts,
        },
        "rules": rules_out,
        "special_rewards_triggered": int(special_cnt),
        "birthday_bonuses_triggered": int(birthday_cnt),
    }


# ── Overview ─────────────────────────────────────────────────────────────────
@router.get("/analytics/overview", summary="Merchant analytics overview")
async def m_overview(
    days: int = Query(30, ge=1, le=365),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    prev_since = since - timedelta(days=days)

    async def _count_tx(start):
        return (await db.execute(
            select(sa_func.count(Transaction.id))
            .where(Transaction.merchant_id == merchant.id, Transaction.created_at >= start)
        )).scalar() or 0

    async def _rev(start):
        return float((await db.execute(
            select(sa_func.coalesce(sa_func.sum(Transaction.amount), 0))
            .where(
                Transaction.merchant_id == merchant.id,
                Transaction.created_at >= start,
                Transaction.tx_type == "earn",
            )
        )).scalar() or 0)

    cur_tx = await _count_tx(since)
    prev_tx = await _count_tx(prev_since) - cur_tx
    cur_rev = await _rev(since)
    prev_rev = await _rev(prev_since) - cur_rev

    new_cards = (await db.execute(
        select(sa_func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.issued_at >= since)
    )).scalar() or 0

    active_customers = (await db.execute(
        select(sa_func.count(sa_func.distinct(Transaction.card_id)))
        .where(Transaction.merchant_id == merchant.id, Transaction.created_at >= since)
    )).scalar() or 0

    def _pct(a, b):
        if b <= 0:
            return None
        return round((a - b) / b * 100, 1)

    # Kunlik trend (grafik uchun) — har kun revenue + tranzaksiyalar soni.
    day_col = sa_func.date_trunc("day", Transaction.created_at)
    trend_rows = (await db.execute(
        select(
            day_col.label("d"),
            sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("rev"),
            sa_func.count(Transaction.id).label("cnt"),
        )
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
            Transaction.tx_type == "earn",
        )
        .group_by(day_col)
    )).all()
    by_date = {
        (r.d.date().isoformat() if hasattr(r.d, "date") else str(r.d)):
            (float(r.rev or 0), int(r.cnt or 0))
        for r in trend_rows
    }
    today = datetime.now(timezone.utc).date()
    trend = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        rev, cnt = by_date.get(day.isoformat(), (0.0, 0))
        trend.append({"date": day.isoformat(), "revenue": rev, "tx": cnt})

    # Berilgan: stamp rejimida earn txlar soni, cashbackda sum(points_delta).
    if merchant.loyalty_type == "stamp":
        points_issued = int((await db.execute(
            select(sa_func.count(Transaction.id))
            .where(
                Transaction.merchant_id == merchant.id,
                Transaction.created_at >= since,
                Transaction.tx_type == "earn",
            )
        )).scalar() or 0)
    else:
        points_issued = int((await db.execute(
            select(sa_func.coalesce(sa_func.sum(Transaction.points_delta), 0))
            .where(
                Transaction.merchant_id == merchant.id,
                Transaction.created_at >= since,
                Transaction.tx_type == "earn",
                Transaction.points_delta > 0,
            )
        )).scalar() or 0)

    # O'rtacha LTV — umrbod jami savdo / xarid qilgan mijozlar soni.
    total_rev_all = float((await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.amount), 0))
        .where(Transaction.merchant_id == merchant.id, Transaction.tx_type == "earn")
    )).scalar() or 0)
    buyers_count = (await db.execute(
        select(sa_func.count(sa_func.distinct(Transaction.card_id)))
        .where(Transaction.merchant_id == merchant.id, Transaction.tx_type == "earn")
    )).scalar() or 0
    avg_ltv = round(total_rev_all / buyers_count) if buyers_count else 0

    # Saqlanish (retention) va yo'qotish (churn) — RFM bilan bir xil mantiq.
    # retention = oxirgi 30 kunda faol kartalar ulushi.
    # churn = 90+ kun kelmagan (yoki hech qachon) kartalar ulushi.
    from sqlalchemy import or_ as _or
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)
    d90 = now - timedelta(days=90)
    total_cards = (await db.execute(
        select(sa_func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    )).scalar() or 0
    active_30d = (await db.execute(
        select(sa_func.count(sa_func.distinct(Transaction.card_id)))
        .where(Transaction.merchant_id == merchant.id, Transaction.created_at >= d30)
    )).scalar() or 0
    churned_count = (await db.execute(
        select(sa_func.count(Card.id))
        .where(
            Card.merchant_id == merchant.id,
            Card.is_active.is_(True),
            _or(Card.last_used_at < d90, Card.last_used_at.is_(None)),
        )
    )).scalar() or 0
    retention_30d = round(active_30d / total_cards * 100, 1) if total_cards else 0.0
    churn_30d = round(churned_count / total_cards * 100, 1) if total_cards else 0.0

    return {
        "days_range": days,
        "transactions": {"current": cur_tx, "previous": prev_tx, "change_pct": _pct(cur_tx, prev_tx)},
        "revenue": {"current": cur_rev, "previous": prev_rev, "change_pct": _pct(cur_rev, prev_rev)},
        "new_cards": new_cards,
        "active_customers": active_customers,
        "points_issued": points_issued,
        "loyalty_type": merchant.loyalty_type,
        "avg_ltv": avg_ltv,
        "retention_30d": retention_30d,
        "churn_30d": churn_30d,
        "trend": trend,
    }


# ── Monthly CSV report ───────────────────────────────────────────────────────
@router.get("/reports/monthly", summary="Oylik CSV hisobot")
async def m_monthly_report(
    month: str = Query(..., description="YYYY-MM format", pattern=r"^\d{4}-\d{2}$"),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    try:
        year, mo = map(int, month.split("-"))
        start = datetime(year, mo, 1, tzinfo=timezone.utc)
        if mo == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, mo + 1, 1, tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, "month: YYYY-MM format")

    rows = (await db.execute(
        select(Transaction, Card)
        .join(Card, Card.id == Transaction.card_id)
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= start,
            Transaction.created_at < end,
        )
        .order_by(Transaction.created_at)
    )).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "Sana", "Vaqt", "Tur", "Karta UID", "Egasi", "Telefon", "Tier",
        "Summa (so'm)", "Ball o'zgarishi", "Izoh",
    ])
    totals_earn_amount = 0.0
    totals_earn_points = 0
    totals_redeem_points = 0
    for tx, c in rows:
        w.writerow([
            tx.created_at.strftime("%Y-%m-%d") if tx.created_at else "",
            tx.created_at.strftime("%H:%M:%S") if tx.created_at else "",
            tx.tx_type,
            c.card_uid,
            c.holder_name,
            c.holder_phone,
            c.tier,
            float(tx.amount or 0),
            tx.points_delta,
            tx.note or "",
        ])
        if tx.tx_type == "earn":
            totals_earn_amount += float(tx.amount or 0)
            totals_earn_points += int(tx.points_delta or 0)
        else:
            totals_redeem_points += abs(int(tx.points_delta or 0))

    w.writerow([])
    w.writerow(["JAMI", "", "", "", "", "", "",
                totals_earn_amount, totals_earn_points - totals_redeem_points,
                f"earn: {totals_earn_points} · redeem: {totals_redeem_points}"])

    buf.seek(0)
    filename = f"report-{merchant.id}-{month}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
