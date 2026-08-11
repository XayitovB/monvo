"""
core/tariff_gate.py
───────────────────
Tarif (subscription) bo'yicha funksiya cheklovi — backend himoyasi.

Merchant panelidagi funksiyalar uning tarifiga qarab ishlaydi.
Frontend UI'da qulflanadi, bu yerda esa API darajasida majburlanadi
(chetlab o'tib bo'lmasligi uchun).

Foydalanish:

    from core.tariff_gate import require_feature, enforce_limit

    # Funksiya bayrog'i:
    @router.post("/merchants/me/api-tokens")
    async def create_token(
        merchant: Merchant = Depends(require_feature("api_access")),
        ...
    ): ...

    # Sonli limit (yangi yozuv qo'shishdan oldin):
    await enforce_limit(db, merchant, "max_branches", current_count, "filial")
"""
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.subscription import resolve_merchant_tariff
from database import get_db
from models import Merchant, Tariff


# feature kaliti → Tariff modelidagi `has_*` ustun nomi
FEATURE_ATTR = {
    "tier": "has_tier",
    "gamification": "has_gamification",
    "games": "has_games",
    "birthday_bonus": "has_birthday_bonus",
    "segments_advanced": "has_segments_advanced",
    "card_design_custom": "has_card_design_custom",
    "api_access": "has_api_access",
    "priority_support": "has_priority_support",
    "scheduled_push": "has_scheduled_push",
    "pos_integration": "has_pos_integration",
}

# Foydalanuvchiga ko'rsatiladigan nomlar (xato xabarida)
FEATURE_TITLE = {
    "tier": "Darajalar (tier) tizimi",
    "gamification": "Geymifikatsiya",
    "games": "Mini o'yinlar",
    "birthday_bonus": "Tug'ilgan kun bonusi",
    "segments_advanced": "Ilg'or segmentlash",
    "card_design_custom": "Shaxsiy karta dizayni",
    "api_access": "API integratsiya",
    "priority_support": "Prioritet qo'llab-quvvatlash",
    "scheduled_push": "Rejalashtirilgan push",
    "pos_integration": "POS integratsiya",
}

# limit kaliti → foydalanuvchiga ko'rsatiladigan nom
LIMIT_TITLE = {
    "max_customers": "mijozlar",
    "max_branches": "filiallar",
    "max_staff": "kassirlar",
    "max_rewards": "sovg'alar",
    "max_push_per_month": "oylik push xabarlar",
    "max_announcements": "e'lonlar",
}


async def load_tariff(merchant: Merchant, db: AsyncSession) -> Optional[Tariff]:
    """
    Merchant'ning amaldagi (FAOL) tarifini qaytaradi — yagona manbadan
    (MerchantSubscription va merchant.tariff_id sinxron). Obuna faol emas
    bo'lsa None.
    """
    res = await resolve_merchant_tariff(merchant, db)
    return res["tariff"] if res["active"] else None


def _flag(tariff: Optional[Tariff], feature_key: str) -> bool:
    """Tarifda funksiya bayrog'i yoqilganmi."""
    if tariff is None:
        return False
    attr = FEATURE_ATTR.get(feature_key)
    return bool(getattr(tariff, attr, False)) if attr else False


def require_feature(feature_key: str):
    """
    Dependency factory — endpointni tarif funksiyasiga bog'laydi.

    Obuna faol emas yoki funksiya tarifda yo'q bo'lsa 403 qaytaradi.
    Holat admin paneli bilan bir xil manbadan (resolve_merchant_tariff)
    hisoblanadi — divergensiya bo'lmaydi.
    """
    async def _dep(
        merchant: Merchant = Depends(get_current_merchant),
        db: AsyncSession = Depends(get_db),
    ) -> Merchant:
        res = await resolve_merchant_tariff(merchant, db)
        title = FEATURE_TITLE.get(feature_key, feature_key)
        # Obuna faol emas → bloklash.
        if not res["active"]:
            raise HTTPException(
                status_code=403,
                detail=f"🔒 «{title}» funksiyasi sizning tarifingizda mavjud emas. Tarifni yangilang.",
            )
        # Tariff yozuvi bor → aniq bayroqni tekshiramiz. Tariff yo'q, lekin
        # BillingPlan obunasi faol (to'lagan merchant) → bloklamaymiz.
        if res["tariff"] is not None and not _flag(res["tariff"], feature_key):
            raise HTTPException(
                status_code=403,
                detail=f"🔒 «{title}» funksiyasi sizning tarifingizda mavjud emas. Tarifni yangilang.",
            )
        return merchant

    return _dep


async def enforce_limit(
    db: AsyncSession,
    merchant: Merchant,
    limit_attr: str,
    current_count: int,
    label: Optional[str] = None,
) -> None:
    """
    Sonli limitni tekshiradi — yangi yozuv qo'shishdan OLDIN chaqiriladi.

    Tarif yo'q bo'lsa yoki limit null/<0 bo'lsa — cheksiz (tekshirilmaydi).
    `current_count` mavjud yozuvlar soni; u limitga yetgan bo'lsa 403.
    """
    tariff = await load_tariff(merchant, db)
    if tariff is None:
        return
    limit = getattr(tariff, limit_attr, None)
    # null yoki manfiy = cheksiz
    if limit is None or limit < 0:
        return
    if current_count >= limit:
        title = label or LIMIT_TITLE.get(limit_attr, limit_attr)
        raise HTTPException(
            status_code=403,
            detail=f"🔒 «{title}» limiti to'ldi (maksimum {limit}). Tarifni yangilang.",
        )
