"""
routers/rewards.py
──────────────────
Merchant reward katalogi + point rules.

Merchant (MerchantBearer):
  POST   /rewards          — yangi reward qo'shish
  GET    /rewards          — reward ro'yxati
  PATCH  /rewards/{id}     — reward yangilash
  DELETE /rewards/{id}     — reward o'chirish

  POST   /rewards/rules         — point rule yaratish
  GET    /rewards/rules         — point rules
  DELETE /rewards/rules/{id}    — rule o'chirish

Public:
  GET /rewards/public/{merchant_id} — merchantning faol rewardlari (mobil katalog)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.tariff_gate import enforce_limit
from database import get_db
from models import Merchant, PointRule, Reward
from schemas import (
    PointRuleCreate,
    PointRuleOut,
    RewardCreate,
    RewardOut,
    RewardUpdate,
)

router = APIRouter(prefix="/rewards", tags=["🎁 Rewards"])


# ── Rewards CRUD ─────────────────────────────────────────────────────────────
@router.post("", response_model=RewardOut, status_code=201,
             summary="Yangi reward (bepul mahsulot / chegirma)")
async def create_reward(
    body: RewardCreate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    reward_count = (await db.execute(
        select(sa_func.count(Reward.id)).where(Reward.merchant_id == merchant.id)
    )).scalar() or 0
    await enforce_limit(db, merchant, "max_rewards", reward_count, "sovg'alar")
    reward = Reward(
        merchant_id=merchant.id,
        title=body.title,
        description=body.description or "",
        points_cost=body.points_cost,
        image_url=body.image_url or "",
        stock=body.stock,
        category=body.category or "general",
        min_tier=body.min_tier or "bronze",
        icon=body.icon or "gift",
        color=body.color or "#7C3AED",
        terms=body.terms or "",
        max_per_user=body.max_per_user if body.max_per_user is not None else -1,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        sort_order=body.sort_order if body.sort_order is not None else 100,
    )
    db.add(reward)
    await db.commit()
    await db.refresh(reward)
    return reward


@router.get("", response_model=list[RewardOut], summary="Merchant reward katalogi")
async def list_rewards(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    active_only: bool = False,
):
    q = select(Reward).where(Reward.merchant_id == merchant.id)
    if active_only:
        q = q.where(Reward.is_active.is_(True))
    result = await db.execute(q.order_by(Reward.sort_order.asc(), Reward.points_cost.asc()))
    return list(result.scalars().all())


@router.patch("/{reward_id}", response_model=RewardOut, summary="Reward yangilash")
async def update_reward(
    reward_id: int,
    body: RewardUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reward).where(Reward.id == reward_id, Reward.merchant_id == merchant.id)
    )
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(404, "Reward topilmadi")
    _REWARD_UPDATE_FIELDS = {
        "title", "description", "image_url", "points_cost",
        "stock", "is_active", "category", "min_tier", "expires_at",
    }
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in _REWARD_UPDATE_FIELDS:
            setattr(reward, field, value)
    await db.commit()
    await db.refresh(reward)
    return reward


@router.delete("/{reward_id}", status_code=204, summary="Reward o'chirish")
async def delete_reward(
    reward_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reward).where(Reward.id == reward_id, Reward.merchant_id == merchant.id)
    )
    reward = result.scalar_one_or_none()
    if not reward:
        raise HTTPException(404, "Reward topilmadi")
    await db.delete(reward)
    await db.commit()
    return None


# ── Point Rules ──────────────────────────────────────────────────────────────
@router.post("/rules", response_model=PointRuleOut, status_code=201,
             summary="Ball to'plash qoidasi yaratish")
async def create_rule(
    body: PointRuleCreate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rule = PointRule(
        merchant_id=merchant.id,
        name=body.name,
        rule_type=body.rule_type,
        amount_per_point=body.amount_per_point,
        points_per_visit=body.points_per_visit,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/rules", response_model=list[PointRuleOut],
            summary="Merchant qoidalari")
async def list_rules(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PointRule).where(PointRule.merchant_id == merchant.id)
    )
    return list(result.scalars().all())


@router.delete("/rules/{rule_id}", status_code=204, summary="Qoidani o'chirish")
async def delete_rule(
    rule_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PointRule).where(
            PointRule.id == rule_id, PointRule.merchant_id == merchant.id
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule topilmadi")
    await db.delete(rule)
    await db.commit()
    return None


# ── Public catalog (mobil ilova uchun) ───────────────────────────────────────
@router.get("/public/{merchant_id}", response_model=list[RewardOut],
            summary="Merchantning ochiq reward katalogi")
async def public_rewards(merchant_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Reward).where(
            Reward.merchant_id == merchant_id, Reward.is_active.is_(True)
        ).order_by(Reward.points_cost.asc())
    )
    return list(result.scalars().all())
