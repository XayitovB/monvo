"""POS provayder parser'lari.

Har bir modul `parse(body, headers, credentials)` -> NormalizedSale | None
funksiyasini eksport qiladi. Webhook dispatcher slug bo'yicha to'g'ri parserni
chaqiradi.
"""
from typing import Awaitable, Callable, Optional

from core.pos_engine import NormalizedSale

from . import alipos, billz, iiko, poster, rkeeper, yclients

ParseFn = Callable[[dict, dict, dict], Optional[NormalizedSale]]

PARSERS: dict[str, ParseFn] = {
    "alipos":   alipos.parse,
    "billz":    billz.parse,
    "iiko":     iiko.parse,
    "poster":   poster.parse,
    "rkeeper":  rkeeper.parse,
    "yclients": yclients.parse,
    # onec va moysklad — webhook emas, polling worker'i orqali ishlaydi
}


def get_parser(slug: str) -> Optional[ParseFn]:
    return PARSERS.get(slug)
