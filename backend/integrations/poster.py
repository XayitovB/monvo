"""Poster POS webhook parser.

Hujjat: https://dev.joinposter.com/

Poster "transaction.closed" formati:
  {
    "account": "demoaccount",
    "object": "transaction",
    "object_id": 12345,
    "action": "transformed",
    "data": {
      "transaction_id": 12345,
      "sum": 125000,
      "client": {"phone": "+998901234567", "client_id": 99},
      ...
    },
    "verification_token": "..."
  }
"""
from typing import Optional

from core.pos_engine import NormalizedSale


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    data = body.get("data") or body
    if not isinstance(data, dict):
        return None

    external_ref = (
        data.get("transaction_id")
        or data.get("id")
        or body.get("object_id")
    )
    if not external_ref:
        return None

    amount = data.get("sum") or data.get("total_sum") or data.get("amount") or 0
    try:
        # Poster ko'pincha tiyinda yuboradi → so'mga aylantirish kerak (1 so'm = 100 tiyin)
        amount = float(amount)
        # Heuristik: agar summa juda katta (1 mln+) bo'lsa, tiyinda kelgan
        if amount > 1_000_000 and amount % 100 == 0:
            amount = amount / 100
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        return None

    client = data.get("client") or {}
    if not isinstance(client, dict):
        client = {}
    phone = client.get("phone") or data.get("client_phone")

    return NormalizedSale(
        external_ref=str(external_ref),
        amount=amount,
        phone=str(phone) if phone else None,
        note="Poster",
    )
