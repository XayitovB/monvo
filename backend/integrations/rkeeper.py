"""r_keeper / RK Cloud webhook parser.

Hujjat: https://docs.rkeeper.ru/

r_keeper "ChequeClosed" formati (XML/JSON variantlarida):
  {
    "cheque": {
      "uid": "rk-uuid",
      "objectId": "obj-1",
      "total": 125000,
      "guest": {"phone": "+998..."}
    }
  }
"""
from typing import Optional

from core.pos_engine import NormalizedSale


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    cheque = body.get("cheque") or body.get("data") or body
    if not isinstance(cheque, dict):
        return None

    external_ref = (
        cheque.get("uid")
        or cheque.get("id")
        or cheque.get("chequeId")
    )
    if not external_ref:
        return None

    amount = cheque.get("total") or cheque.get("sum") or cheque.get("amount") or 0
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        return None

    guest = cheque.get("guest") or cheque.get("customer") or {}
    if not isinstance(guest, dict):
        guest = {}
    phone = guest.get("phone") or cheque.get("phone")

    return NormalizedSale(
        external_ref=str(external_ref),
        amount=amount,
        phone=str(phone) if phone else None,
        note="r_keeper",
    )
