"""ALIPOS integratsiyasi — webhook parser.

ALIPOS — restoran agregatorlarga (Yandex Eats, Wolt va h.k.) buyurtma
yo'naltiruvchi POS tizim. Hujjatlardagi asosiy oqim:

  Buyurtma → ALIPOS holati o'zgartiradi (NEW → ACCEPTED → READY → ...)
            → har holat o'zgarishida POS partner endpoint'ga webhook yuboradi

Auth (OAuth 2.0 client credentials) bizning tarafda kerak emas — biz
ALIPOS'ga so'rov yubormay, faqat uning webhooklarini qabul qilamiz.
ALIPOS webhook header'iga `clientId` + `clientSecret` qo'yadi (har
restoran o'ziniki); biz `_signatures.verify_alipos` orqali tekshiramiz.

Status mapping (loyalty uchun):
  ACCEPTED_BY_RESTAURANT → earn  (inplace orderlar uchun — restoran qabul qildi
                                 = kassada to'lov tugadi)
  READY                  → earn  (pickup orderlar — kitchen done)
  TAKEN_BY_COURIER       → earn  (delivery — kuryer oldi)
  CANCELED               → refund (idempotency: agar earn yozilgan bo'lsa, qaytariladi)
  Boshqa (NEW)           → None  (hali yangi, kuting)

Idempotency `external_ref` bo'yicha — bir xil eatsId bilan ACCEPTED + READY +
TAKEN_BY_COURIER kelsa ham faqat birinchisi ball beradi.

Reference: https://docs.alipos.uz (2026-03-05)
"""
from __future__ import annotations

from typing import Optional

from loguru import logger

from core.pos_engine import NormalizedSale


_AWARD_STATUSES = {
    "PAID",                      # "Buyurtma to'landi" webhook — eng aniq signal
    "ACCEPTED_BY_RESTAURANT",   # inplace: kassada to'lov tugadi
    "READY",                     # pickup: ovqat tayyor
    "TAKEN_BY_COURIER",          # delivery: kuryer oldi
    "COMPLETED",                 # ALIPOS UI'da boshqa shakllarda yuborilishi mumkin
    "FINISHED",
}
_CANCEL_STATUSES = {"CANCELED", "CANCELLED", "REFUNDED"}


def _phone_from(body: dict) -> Optional[str]:
    """Mijoz telefonini deliveryInfo.phoneNumber yoki realPhoneNumber'dan oladi."""
    di = body.get("deliveryInfo") or {}
    p = (di.get("phoneNumber") or di.get("realPhoneNumber") or "").strip()
    return p or None


def _amount_from(body: dict) -> float:
    """Buyurtma summasi — paymentInfo.itemsCost (Total ham bor, lekin
    ko'p webhook'larda itemsCost ishonchliroq)."""
    pi = body.get("paymentInfo") or {}
    for key in ("total", "itemsCost"):
        v = pi.get(key)
        if v is None:
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    # Fallback: items.price * quantity yig'indisi
    total = 0.0
    for item in body.get("items", []) or []:
        try:
            total += float(item.get("price") or 0) * float(item.get("quantity") or 0)
        except (TypeError, ValueError):
            continue
    return total


def _external_ref(body: dict) -> str:
    """Buyurtma ID — eatsId asosiy, fallback orderNumber."""
    return str(body.get("eatsId") or body.get("orderNumber") or "").strip()


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    """ALIPOS order webhook'ini NormalizedSale'ga aylantiradi.

    Faqat ball beriladigan yoki bekor qilinadigan holatlarda qaytaradi.
    Boshqa statuslar (NEW, ACCEPTED_BY_RESTAURANT) None qaytaradi —
    dispatcher buni 200 OK skip sifatida ishlatadi.
    """
    if not isinstance(body, dict):
        logger.warning(f"alipos parser: body dict emas — type={type(body).__name__}")
        return None

    status = (body.get("status") or "").strip().upper()
    external_ref = _external_ref(body)
    body_keys = list(body.keys())[:20]
    phone_present = bool((body.get("deliveryInfo") or {}).get("phoneNumber"))
    logger.info(
        f"alipos webhook IN — status={status!r} eatsId={external_ref!r} "
        f"phone_present={phone_present} top_keys={body_keys}"
    )

    if not external_ref:
        logger.warning(f"alipos parser: eatsId/orderNumber bo'sh — body keys: {body_keys}")
        return None

    # "Buyurtma to'landi" webhook'i alohida `paid: true` field'i yoki
    # `event: "paid"` bilan kelishi mumkin — body sxemasi to'liq hujjatlanmagan.
    # Har ikki holatni earn deb hisoblaymiz.
    paid_event = (
        body.get("paid") is True
        or (str(body.get("event") or "").strip().lower() in {"paid", "payment", "buyurtma_tolandi"})
    )

    # Permissive matching — status'ning ichida ma'lum so'zlar bo'lsa earn deb hisoblaymiz.
    # ALIPOS hujjatlangan statuslar to'liq emas, real webhook'da boshqa nomlar
    # bo'lishi mumkin (PAYMENT_RECEIVED, ORDER_COMPLETED, va h.k.).
    status_low = status.lower()
    award_keyword = any(kw in status_low for kw in (
        "paid", "ready", "taken", "accept", "complet", "finish", "delivered", "fulfil",
    ))
    cancel_keyword = any(kw in status_low for kw in ("cancel", "refund", "decline", "reject"))

    if status in _CANCEL_STATUSES or cancel_keyword:
        kind = "refund"
    elif paid_event or status in _AWARD_STATUSES or award_keyword:
        kind = "earn"
    else:
        logger.info(
            f"alipos parser: status {status!r} qabul qilinmadi (NEW yoki noma'lum) — skip"
        )
        return None

    phone = _phone_from(body)
    amount = _amount_from(body)

    # Restaurant ID — keyinchalik branch mapping uchun ishlatish mumkin
    restaurant_id = (body.get("restaurantId") or "").strip() or None

    # Comment yoki birinchi item nomidan note (kassir CRM'da nima sotilganini ko'rishi uchun)
    note_parts = []
    if body.get("comment"):
        note_parts.append(str(body["comment"])[:80])
    items = body.get("items") or []
    if items:
        first = items[0]
        item_name = str(first.get("name") or "")[:60]
        if item_name:
            qty = first.get("quantity") or 1
            try:
                qty_str = str(int(float(qty)))
            except (TypeError, ValueError):
                qty_str = "1"
            note_parts.append(f"{qty_str}× {item_name}" + (f" (+{len(items) - 1})" if len(items) > 1 else ""))
    note = " | ".join(note_parts) or f"alipos {status.lower()}"

    return NormalizedSale(
        external_ref=external_ref,
        amount=amount,
        phone=phone,
        external_customer_id=None,        # ALIPOS webhook'da customer_id yo'q
        external_terminal_id=restaurant_id,
        kind=kind,
        note=note,
    )
