"""YCLIENTS webhook parser.

Hujjat: https://developers.yclients.com/

"record.create" / "record.update" / "transaction.create" hodisalari:
  {
    "company_id": 123,
    "resource": "record",
    "resource_id": 99,
    "data": {
      "id": 99,
      "client": {"phone": "+998901234567", "name": "Aziz"},
      "cost": 250000,
      "paid_full": 1
    }
  }
"""
from typing import Optional

from core.pos_engine import NormalizedSale


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    data = body.get("data") or body
    if not isinstance(data, dict):
        return None

    external_ref = (
        data.get("id")
        or body.get("resource_id")
        or data.get("transaction_id")
    )
    if not external_ref:
        return None

    amount = (
        data.get("cost")
        or data.get("paid")
        or data.get("amount")
        or data.get("sum")
        or 0
    )
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        return None

    # Faqat to'liq to'langan yozuvlarga ball — qisman to'lov esa keyin ulgurji yopilganda
    if "paid_full" in data and not data.get("paid_full"):
        return None

    client = data.get("client") or {}
    if not isinstance(client, dict):
        client = {}
    phone = client.get("phone") or data.get("phone")

    return NormalizedSale(
        external_ref=f"rec_{external_ref}",
        amount=amount,
        phone=str(phone) if phone else None,
        note="YCLIENTS",
    )
