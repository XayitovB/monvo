"""Merchant API token boshqaruvi.

Merchant o'z panelidan integratsiya tokenlarini yaratadi/o'chiradi.

  GET    /merchants/me/api-tokens        — ro'yxat (faqat masklangan ko'rinishda)
  POST   /merchants/me/api-tokens        — yangi token (token to'liq qiymati BIR MARTA qaytariladi)
  DELETE /merchants/me/api-tokens/{id}   — tokenni o'chirish (revoke)

Bu endpointlar JWT merchant session token bilan kiritiladi (merchant paneli).
Public Merchant API endpointlari (`/api/v1/...`) esa shu yerda chiqarilgan
API tokenlar bilan ishlaydi.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from core.api_tokens import generate_token, mask_token
from core.dependencies import get_current_merchant
from core.tariff_gate import require_feature
from database import get_db
from models import Merchant, MerchantApiToken


router = APIRouter(prefix="/merchants/me/api-tokens", tags=["🔑 Merchant API Tokens"])


def _serialize(row: MerchantApiToken, *, include_token: Optional[str] = None) -> dict:
    base = {
        "id": row.id,
        "name": row.name,
        "token_prefix": row.token_prefix,
        "token_masked": mask_token(row.token_prefix),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "last_used_ip": row.last_used_ip or "",
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        "expires_at": row.expires_at.isoformat() if getattr(row, "expires_at", None) else None,
        "locked_until": row.locked_until.isoformat() if getattr(row, "locked_until", None) else None,
        "failed_attempts": int(getattr(row, "failed_attempts", 0) or 0),
    }
    if include_token is not None:
        # Token to'liq qiymati FAQAT yaratilgan paytda qaytariladi
        base["token"] = include_token
    return base


class TokenIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Tokenni eslab qolish uchun nom (masalan: 'Production server', 'Telegram bot')")
    expires_in_days: Optional[int] = Field(
        None, ge=1, le=3650,
        description="Tokenning amal qilish muddati (kun). Bo'sh = cheksiz. Tavsiya: 90."
    )


@router.get("", summary="Mening API tokenlarim")
async def list_tokens(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantApiToken)
        .where(
            MerchantApiToken.merchant_id == merchant.id,
            MerchantApiToken.revoked_at.is_(None),  # revoke qilinganlar ro'yxatda ko'rinmasin
        )
        .order_by(MerchantApiToken.id.desc())
    )).scalars().all()
    return [_serialize(r) for r in rows]


_MAX_ACTIVE_TOKENS = 20


@router.post("", status_code=201, summary="Yangi API token yaratish")
async def create_token(
    body: TokenIn,
    merchant: Merchant = Depends(require_feature("api_access")),
    db: AsyncSession = Depends(get_db),
):
    """Yangi token yaratadi va to'liq qiymatini bir marta qaytaradi.

    ⚠️ Token qiymati saqlanmaydi — agar yo'qotsangiz, yangi token yarating.
    """
    name = body.name.strip()[:100]
    if not name:
        raise HTTPException(400, "name bo'sh bo'lmasin")

    active_count = (await db.execute(
        select(sa_func.count()).select_from(MerchantApiToken).where(
            MerchantApiToken.merchant_id == merchant.id,
            MerchantApiToken.revoked_at.is_(None),
        )
    )).scalar() or 0
    if active_count >= _MAX_ACTIVE_TOKENS:
        raise HTTPException(
            400,
            f"Maksimal {_MAX_ACTIVE_TOKENS} ta aktiv token yaratish mumkin. "
            "Eski tokenlarni o'chirib, yangisini yarating.",
        )

    full, prefix, h = generate_token()
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    row = MerchantApiToken(
        merchant_id=merchant.id,
        name=name,
        token_prefix=prefix,
        token_hash=h,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _serialize(row, include_token=full)


@router.delete("/{token_id}", summary="API tokenni o'chirish (revoke)")
async def revoke_token(
    token_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(MerchantApiToken).where(
            MerchantApiToken.id == token_id,
            MerchantApiToken.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Token topilmadi")
    if row.revoked_at is not None:
        return {"ok": True, "already_revoked": True}
    row.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
