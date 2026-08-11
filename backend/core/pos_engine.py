"""POS webhook'lar uchun umumiy "ball berish" qatlami.

Har bir POS provayder parser'i normallashtirilgan `NormalizedSale` qaytaradi —
keyin shu modul:
  1. Idempotency: (provider, external_ref) bo'yicha dublikat tekshirish
  2. Mijoz topish: telefon yoki card_uid bo'yicha — yo'q bo'lsa lazy enroll
  3. Loyalty engine yoki fallback orqali ballni hisoblash
  4. Transaction yozish + card.points yangilash + gamification

`scan_earn` (cashier QR oqimi) bilan deyarli bir xil mantiq, lekin:
  - Webhook idempotent (qayta yuborilsa bir xil javob)
  - Karta avtomatik yaratiladi (POS faqat telefonni biladi)
  - Cashier emas, integratsiya nomidan yoziladi (note: "Billz #cheque-id")
"""
from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.gamification import on_scan as gam_on_scan
from core.loyalty_engine import evaluate as evaluate_loyalty
from core.tiers import apply_tier
from models import Card, LoyaltyRule, Merchant, PointRule, PosIntegration, Transaction, User


# ── Public types ────────────────────────────────────────────────────────────
@dataclass
class NormalizedSale:
    """POS-agnostic cheki: parser shu shaklni qaytaradi.

    `kind`:
      - "earn"   — odatdagi to'langan chek; ball beriladi
      - "refund" — bekor qilingan/qaytarilgan chek; mos earn tx topilsa
                   ball qaytib olinadi (manfiy tx)

    `external_customer_id` va `external_terminal_id` provider-spetsifik
    UUID/identifikator bo'lib, pos_engine ularni karta/branch'ga
    aylantiradi (ehtiyotkor enrichment qatlami orqali).
    """
    external_ref: str                          # POS chek ID — idempotency key
    amount: float                              # to'lov summasi (so'm)
    phone: Optional[str] = None                # mijoz telefoni (+998...)
    card_uid: Optional[str] = None             # Monvo QR scan qilingan bo'lsa
    external_customer_id: Optional[str] = None # POS mijoz UUID (telefon yo'q bo'lsa)
    external_terminal_id: Optional[str] = None # POS terminal UUID (branch mapping uchun)
    kind: str = "earn"                         # "earn" | "refund" | "spend"
    note: str = ""                             # ko'rinishda ko'rsatiladigan izoh
    # POS o'zi cashback'ni hisoblagan bo'lsa (masalan, Billz 2) — Monvo o'z
    # qoidalarini ishlatmasdan shu qiymatni mijoz balansiga qo'shadi.
    # `None` (default) — Monvo qoidalarni ishga tushirib hisoblaydi.
    forced_points: Optional[int] = None


@dataclass
class EarnResult:
    transaction_id: int
    points: int
    card_uid: str
    duplicate: bool                    # True — chek allaqachon ishlangan
    refunded: bool = False             # True — bu refund tx (manfiy ball)


# ── Helpers ─────────────────────────────────────────────────────────────────
_PHONE_DIGITS = re.compile(r"\D+")


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """+998 90 123-45-67  →  +998901234567 . Bo'sh bo'lsa None."""
    if not raw:
        return None
    digits = _PHONE_DIGITS.sub("", raw)
    if not digits:
        return None
    # 9 ta raqam → +998... ko'rinishida tugadi deb hisoblaymiz
    if len(digits) == 9:
        digits = "998" + digits
    return "+" + digits


def _new_card_uid() -> str:
    """POS lazy enrollment uchun — odamga ko'rinmaydi, faqat ichki ID."""
    return "pos_" + secrets.token_urlsafe(12).replace("_", "").replace("-", "")[:18]


# ── Card resolution ─────────────────────────────────────────────────────────
async def _find_or_create_card(
    *,
    merchant_id: int,
    phone: Optional[str],
    card_uid: Optional[str],
    db: AsyncSession,
) -> Optional[Card]:
    """Topish/yaratish ketma-ketligi:
      1. Aniq card_uid berilgan → topib qaytar
      2. Telefon bo'yicha mavjud kartani topish (Card.holder_phone)
         · Topilgan karta user_id=None bo'lsa va Monvo User mavjud bo'lsa,
           kartani shu user'ga ulaymiz (auto-link).
      3. Karta yo'q lekin Monvo User shu telefon bilan ro'yxatdan o'tgan →
         user_id darhol bog'langan yangi karta
      4. User ham yo'q → "lazy" karta (user_id=None) — keyin user
         Monvo'ga kirib telefonini tasdiqlasa, kartasi avto-bog'lanadi.
      5. Telefon va card_uid ikkalasi ham yo'q → None (anonim chek skip)
    """
    if card_uid:
        row = (await db.execute(
            select(Card).where(
                Card.card_uid == card_uid,
                Card.merchant_id == merchant_id,
            )
        )).scalar_one_or_none()
        if row:
            return row

    if not phone:
        return None

    # ── Telefon bo'yicha Monvo User'ni topishga harakat ──
    # POS sotuv telefonini Monvo'dagi User.phone bilan moslashtiramiz —
    # shu yo'l bilan biznes bilan oldin "Kartam yo'q" bo'lsa-da, ball egasi
    # bo'ladi (User'ning Monvo app'idagi balansiga keladi).
    user_row = (await db.execute(
        select(User).where(User.phone == phone).limit(1)
    )).scalar_one_or_none()

    row = (await db.execute(
        select(Card).where(
            Card.merchant_id == merchant_id,
            Card.holder_phone == phone,
        )
    )).scalar_one_or_none()
    if row:
        # Auto-link: ilgari lazy yaratilgan karta endi Monvo user'ga bog'lanadi
        if row.user_id is None and user_row is not None:
            row.user_id = user_row.id
            if not row.holder_name and user_row.name:
                row.holder_name = user_row.name
            await db.flush()
            logger.info(
                f"pos_engine: auto-linked existing card uid={row.card_uid} "
                f"phone={phone} → user_id={user_row.id}"
            )
        return row

    # Karta yo'q — yangisini yaratamiz. Monvo user mavjud bo'lsa, darhol bog'laymiz.
    card = Card(
        merchant_id=merchant_id,
        user_id=user_row.id if user_row else None,
        card_uid=_new_card_uid(),
        holder_name=(user_row.name if user_row else "") or "",
        holder_phone=phone,
        points=0,
    )
    db.add(card)
    await db.flush()
    if user_row:
        logger.info(
            f"pos_engine: enrolled card uid={card.card_uid} phone={phone} "
            f"→ Monvo user_id={user_row.id} merchant={merchant_id}"
        )
    else:
        logger.info(
            f"pos_engine: lazy-enrolled card uid={card.card_uid} phone={phone} "
            f"merchant={merchant_id} (no Monvo user yet)"
        )
    return card


# ── Points calculation (mirror of /transactions/scan logic) ────────────────
async def _compute_points(
    *,
    merchant: Merchant,
    card: Card,
    amount: float,
    db: AsyncSession,
) -> tuple[int, list[dict], Optional[str]]:
    has_new_rules = (await db.execute(
        select(LoyaltyRule.id).where(
            LoyaltyRule.merchant_id == merchant.id,
            LoyaltyRule.is_active.is_(True),
        ).limit(1)
    )).scalar_one_or_none() is not None

    if has_new_rules:
        result = await evaluate_loyalty(merchant.id, card, amount, db)
        applied = [
            {"rule_type": a.rule_type, "name": a.name, "points": a.points, "note": a.note}
            for a in result.applied
        ]
        return result.total_points, applied, result.reward_title

    # Fallback: backward-compat PointRule yoki 1000 so'm = 1 ball
    rule = (await db.execute(
        select(PointRule).where(
            PointRule.merchant_id == merchant.id,
            PointRule.is_active.is_(True),
        ).limit(1)
    )).scalar_one_or_none()
    if rule is None:
        return (int(amount // 1000) if amount > 0 else 0), [], None
    if rule.rule_type == "per_visit":
        return int(rule.points_per_visit or 0), [], None
    per = float(rule.amount_per_point or 0)
    if per <= 0:
        return 0, [], None
    return int(amount // per), [], None


# Public alias — tashqi modullar (merchant_api va boshqalar) shu nomdan foydalanadi
compute_points = _compute_points


# ── Provider-specific enrichment ─────────────────────────────────────────────
async def _enrich_iiko_phone(
    *,
    integration: PosIntegration,
    customer_id: str,
) -> Optional[str]:
    """iiko mijoz UUID'idan telefonni iiko Cloud API orqali olish."""
    creds = integration.credentials or {}
    api_login = creds.get("api_login")
    org_id = creds.get("organization_id")
    if not api_login or not org_id:
        return None
    try:
        from integrations.iiko import IikoClient
        async with IikoClient(api_login=api_login, organization_id=org_id) as client:
            cust = await client.get_customer(customer_id)
            return cust.phone if cust else None
    except Exception as e:
        logger.warning(f"pos_engine: iiko customer fetch failed: {e}")
        return None


async def _enrich_billz_phone(
    *,
    integration: PosIntegration,
    customer_id: str,
) -> Optional[str]:
    """Billz 2 mijoz UUID'idan telefonni `/v1/clients/{id}` orqali olish."""
    creds = integration.credentials or {}
    secret_token = creds.get("secret_token") or creds.get("api_secret")  # backward compat
    if not secret_token:
        return None
    try:
        from integrations.billz import BillzClient
        async with BillzClient(secret_token=secret_token) as client:
            cust = await client.get_client(customer_id)
            return cust.phone if cust else None
    except Exception as e:
        logger.warning(f"pos_engine: billz client fetch failed: {e}")
        return None


async def _resolve_branch(
    *,
    integration: PosIntegration,
    terminal_id: Optional[str],
    fallback_branch_id: Optional[int],
) -> Optional[int]:
    """POS terminal UUID → Monvo branch_id mapping.

    Mapping `credentials.terminal_branch_map` JSON ichida saqlanadi:
        {"<terminal_uuid>": <monvo_branch_id>, ...}
    Mapping yo'q bo'lsa fallback (karta o'z branch'i) qaytariladi.
    """
    if not terminal_id:
        return fallback_branch_id
    creds = integration.credentials or {}
    mapping = creds.get("terminal_branch_map") or {}
    if not isinstance(mapping, dict):
        return fallback_branch_id
    raw = mapping.get(terminal_id) or mapping.get(str(terminal_id))
    try:
        return int(raw) if raw is not None else fallback_branch_id
    except (TypeError, ValueError):
        return fallback_branch_id


# ── Public API ──────────────────────────────────────────────────────────────
async def commit_pos_sale(
    *,
    integration: PosIntegration,
    sale: NormalizedSale,
    db: AsyncSession,
) -> Optional[EarnResult]:
    """Webhook orqali kelgan sotuvni Monvo tranzaksiyasiga aylantiradi.

    Qaytaradi:
      EarnResult — agar ball berildi/qaytarildi (yoki dublikat aniqlandi)
      None       — anonim chek (telefon, customer_id, card_uid yo'q) yoki ball=0
    """
    provider = integration.provider
    merchant_id = integration.merchant_id

    # ── 1) Idempotency: bu chek allaqachon ishlangan bo'lsa — qaytar
    # Refund uchun alohida external_ref ("<orig>:refund") ishlatamiz,
    # shu bilan unique (provider, external_ref) constraint earn va refund
    # ikkalasini to'qnashtirmasdan saqlashga imkon beradi.
    idem_ref = sale.external_ref + (":refund" if sale.kind == "refund" else "")
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.provider == provider,
            Transaction.external_ref == idem_ref,
            Transaction.merchant_id == merchant_id,
        )
    )).scalar_one_or_none()
    if existing:
        logger.info(
            f"pos_engine: duplicate {provider}#{sale.external_ref} "
            f"kind={sale.kind} (tx={existing.id}) — skipping"
        )
        return EarnResult(
            transaction_id=existing.id,
            points=int(existing.points_delta),
            card_uid=(await db.get(Card, existing.card_id)).card_uid if existing.card_id else "",
            duplicate=True,
            refunded=(sale.kind == "refund"),
        )

    # ── 1b) Refund / Spend: alohida handler
    if sale.kind == "refund":
        return await _commit_refund(integration=integration, sale=sale, db=db)
    if sale.kind == "spend":
        return await _commit_spend(integration=integration, sale=sale, db=db)

    # ── 2) Merchant + card
    merchant = await db.get(Merchant, merchant_id)
    if merchant is None:
        logger.warning(f"pos_engine: merchant {merchant_id} yo'q — webhook tashlandi")
        return None

    phone = normalize_phone(sale.phone)
    # Telefon yo'q lekin POS-tomonida customer_id mavjud — provayder API orqali boyitamiz
    if not phone and sale.external_customer_id:
        enriched: Optional[str] = None
        if provider == "iiko":
            enriched = await _enrich_iiko_phone(
                integration=integration, customer_id=sale.external_customer_id,
            )
        elif provider == "billz":
            enriched = await _enrich_billz_phone(
                integration=integration, customer_id=sale.external_customer_id,
            )
        phone = normalize_phone(enriched) if enriched else None

    card = await _find_or_create_card(
        merchant_id=merchant_id,
        phone=phone,
        card_uid=sale.card_uid,
        db=db,
    )
    if card is None:
        logger.info(f"pos_engine: anon sale {provider}#{sale.external_ref} merchant={merchant_id} — skipped")
        return None

    # ── 3) Points
    if sale.forced_points is not None:
        # POS o'zi hisoblagan cashback (masalan, Billz 2) — Monvo qoidasi ishlamaydi
        points = max(0, int(sale.forced_points))
        applied = [{"rule_type": "pos_native", "name": f"{provider} cashback", "points": points, "note": ""}]
        reward_title = None
    else:
        points, applied, reward_title = await _compute_points(
            merchant=merchant, card=card, amount=sale.amount, db=db,
        )
    if points <= 0:
        # Anonim emas, ammo qoidalar 0 chiqardi — log uchun yozamiz lekin tx yaratmaymiz
        logger.info(f"pos_engine: 0 points for {provider}#{sale.external_ref} amount={sale.amount}")
        return None

    # ── 4) Branch mapping (POS terminal → Monvo filiali)
    branch_id = await _resolve_branch(
        integration=integration,
        terminal_id=sale.external_terminal_id,
        fallback_branch_id=card.branch_id,
    )

    # ── 5) Transaction + card update
    note_parts: list[str] = []
    if sale.note:
        note_parts.append(sale.note)
    note_parts.append(f"{provider}#{sale.external_ref}")
    if reward_title:
        note_parts.append(f"🎁 {reward_title}")
    note = " | ".join(note_parts)[:300]

    card.points += points
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, merchant)

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant_id,
        tx_type="earn",
        points_delta=points,
        amount=Decimal(str(sale.amount)),
        note=note,
        branch_id=branch_id,
        applied_rules=applied,
        provider=provider,
        external_ref=sale.external_ref,
    )
    db.add(tx)

    # PosIntegration last_sync_at
    integration.last_sync_at = datetime.now(timezone.utc)
    integration.last_error = ""

    await db.flush()  # tx.id ni olish uchun

    # Gamification (silent uchun no-op user_id=None bo'lsa)
    try:
        await gam_on_scan(
            user_id=card.user_id,
            merchant_id=merchant_id,
            amount=sale.amount,
            points=points,
            db=db,
        )
    except Exception as e:
        logger.warning(f"pos_engine: gamification failed: {e}")

    await db.commit()
    await db.refresh(tx)
    logger.info(
        f"pos_engine: {provider}#{sale.external_ref} merchant={merchant_id} "
        f"card={card.card_uid} +{points} ball (tx={tx.id})"
    )
    return EarnResult(
        transaction_id=tx.id,
        points=points,
        card_uid=card.card_uid,
        duplicate=False,
    )


# ── Refund ──────────────────────────────────────────────────────────────────
async def _commit_refund(
    *,
    integration: PosIntegration,
    sale: NormalizedSale,
    db: AsyncSession,
) -> Optional[EarnResult]:
    """Bekor qilingan/qaytarilgan chekka mos `earn` tx topib, teskari yozadi.

    Idempotent: agar refund tx allaqachon yozilgan bo'lsa, yuqorida
    `commit_pos_sale` ichida ushlanadi va bu yerga kelmaydi.
    """
    provider = integration.provider
    merchant_id = integration.merchant_id

    original = (await db.execute(
        select(Transaction).where(
            Transaction.provider == provider,
            Transaction.external_ref == sale.external_ref,
            Transaction.merchant_id == merchant_id,
            Transaction.tx_type == "earn",
        )
    )).scalar_one_or_none()
    if original is None:
        # Earn tx topilmadi (anonim chek edi yoki qoidalar 0 ball chiqargandi).
        logger.info(
            f"pos_engine: refund {provider}#{sale.external_ref} — original earn yo'q, skip"
        )
        return None

    if not original.card_id:
        return None

    card = await db.get(Card, original.card_id)
    if card is None:
        return None

    refund_points = -int(original.points_delta or 0)
    if refund_points == 0:
        return None

    # Karta balansini koraytirmaslik uchun: ballar yetmasa shuncha qaytaramiz
    if card.points + refund_points < 0:
        refund_points = -int(card.points)

    note_parts: list[str] = ["refund"]
    if sale.note:
        note_parts.append(sale.note)
    note_parts.append(f"{provider}#{sale.external_ref}")
    note = " | ".join(note_parts)[:300]

    card.points += refund_points
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, await db.get(Merchant, merchant_id))

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant_id,
        tx_type="refund",
        points_delta=refund_points,
        amount=Decimal(str(-sale.amount)) if sale.amount else Decimal("0"),
        note=note,
        branch_id=original.branch_id,
        applied_rules=[],
        provider=provider,
        external_ref=sale.external_ref + ":refund",
    )
    db.add(tx)

    integration.last_sync_at = datetime.now(timezone.utc)
    integration.last_error = ""

    await db.flush()
    await db.commit()
    await db.refresh(tx)

    logger.info(
        f"pos_engine: REFUND {provider}#{sale.external_ref} merchant={merchant_id} "
        f"card={card.card_uid} {refund_points} ball (tx={tx.id})"
    )
    return EarnResult(
        transaction_id=tx.id,
        points=refund_points,
        card_uid=card.card_uid,
        duplicate=False,
        refunded=True,
    )


# ── Spend (cashback redemption) ─────────────────────────────────────────────
async def _commit_spend(
    *,
    integration: PosIntegration,
    sale: NormalizedSale,
    db: AsyncSession,
) -> Optional[EarnResult]:
    """Mijoz Billz terminalida cashback ishlatganda Monvo balansidan yechadi.

    `sale.forced_points` — necha so'm cashback sarflandi (musbat qiymat).
    Idempotency key: `external_ref + ":spend"`.
    """
    provider = integration.provider
    merchant_id = integration.merchant_id

    idem_ref = sale.external_ref + ":spend"
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.provider == provider,
            Transaction.external_ref == idem_ref,
            Transaction.merchant_id == merchant_id,
        )
    )).scalar_one_or_none()
    if existing:
        card = await db.get(Card, existing.card_id)
        return EarnResult(
            transaction_id=existing.id,
            points=int(existing.points_delta),
            card_uid=card.card_uid if card else "",
            duplicate=True,
        )

    phone = normalize_phone(sale.phone)
    if not phone and sale.external_customer_id:
        enriched = await _enrich_billz_phone(
            integration=integration, customer_id=sale.external_customer_id,
        )
        phone = normalize_phone(enriched) if enriched else None

    card = await _find_or_create_card(
        merchant_id=merchant_id, phone=phone, card_uid=sale.card_uid, db=db,
    )
    if card is None:
        return None

    spend_points = max(0, int(sale.forced_points or 0))
    if spend_points <= 0:
        return None

    # Balansdan ko'p yechmaslik
    actual_deduct = min(spend_points, int(card.points))
    if actual_deduct <= 0:
        return None

    card.points -= actual_deduct
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, await db.get(Merchant, merchant_id))

    branch_id = await _resolve_branch(
        integration=integration,
        terminal_id=sale.external_terminal_id,
        fallback_branch_id=card.branch_id,
    )

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant_id,
        tx_type="redeem",
        points_delta=-actual_deduct,
        amount=Decimal("0"),
        note=f"cashback sarflandi | {provider}#{sale.external_ref}",
        branch_id=branch_id,
        applied_rules=[{"rule_type": "pos_spend", "name": "billz cashback sarflandi", "points": -actual_deduct}],
        provider=provider,
        external_ref=idem_ref,
    )
    db.add(tx)

    integration.last_sync_at = datetime.now(timezone.utc)
    integration.last_error = ""

    await db.flush()
    await db.commit()
    await db.refresh(tx)

    logger.info(
        f"pos_engine: SPEND {provider}#{sale.external_ref} merchant={merchant_id} "
        f"card={card.card_uid} -{actual_deduct} ball (tx={tx.id})"
    )
    return EarnResult(
        transaction_id=tx.id,
        points=-actual_deduct,
        card_uid=card.card_uid,
        duplicate=False,
    )
