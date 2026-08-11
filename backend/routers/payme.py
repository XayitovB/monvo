"""Payme (Paycom) Merchant API endpointi.

Yagona JSON-RPC 2.0 endpoint:
  POST /payme/merchant
  Authorization: Basic Base64("Paycom:<KEY>")

Body misoli:
  {
    "id": 123,
    "method": "PerformTransaction",
    "params": {"id": "5e2cdce5d23c5a0e0c8f4b8e"}
  }

Javob:
  - Muvaffaqiyat: {"id": 123, "result": {...}}
  - Xato:        {"id": 123, "error": {"code": -31050, "message": {...}, "data": "..."}}

Auth muvaffaqiyatsiz bo'lsa: HTTP 200 + error -32504 (Payme spec'i shu shakldagi
javobni kutadi).

Sentry tagging: payme_method, payme_invoice_id.
"""
from __future__ import annotations

import base64
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.payme import (
    ERR_AUTH,
    METHOD_HANDLERS,
    PaymeError,
    _msg,
)
from database import get_db

router = APIRouter(prefix="/payme", tags=["💸 Payme"])


def _set_sentry_tags(**tags: Any) -> None:
    try:
        import sentry_sdk
        for k, v in tags.items():
            sentry_sdk.set_tag(k, str(v))
    except Exception:
        pass


def _check_basic_auth(authorization: str, extra_keys: list[str] | None = None) -> bool:
    """`Authorization: Basic Base64("Paycom:<KEY>")` ni tekshirish.

    Production va test kalitlarining ikkalasini ham qabul qilamiz —
    ikkitalik Payme dashboardidagi kassalarga to'g'ri keladi. `extra_keys` —
    admin paneldagi (DB app_settings) kalitlar; env'siz, faqat panel orqali
    sozlash uchun.
    """
    if not authorization or not authorization.lower().startswith("basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:]).decode("utf-8", errors="replace")
    except Exception:
        return False
    if ":" not in decoded:
        return False
    user, _, password = decoded.partition(":")
    if user != "Paycom":
        return False
    keys = [k for k in (settings.PAYME_KEY, settings.PAYME_TEST_KEY, *(extra_keys or [])) if k]
    if not keys:
        return False
    return any(password == k for k in keys)


async def _db_payme_keys(db: AsyncSession) -> list[str]:
    """Admin panelда (DB app_settings) saqlangan Payme kalitlari. Env bo'sh
    bo'lsa ham, panel orqali sozlash ishlasin."""
    try:
        from models import AppSettings
        from sqlalchemy import select as _select
        row = (await db.execute(_select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
        return [k for k in (
            (getattr(row, "payme_key", "") or "").strip(),
            (getattr(row, "payme_test_key", "") or "").strip(),
        ) if k]
    except Exception:  # noqa: BLE001
        return []


def _rpc_error(req_id: Any, err: PaymeError) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"id": req_id, "error": err.to_dict()},
    )


def _rpc_result(req_id: Any, result: dict) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"id": req_id, "result": result},
    )


@router.post("/merchant", summary="Payme JSON-RPC endpoint", include_in_schema=False)
async def payme_merchant(request: Request, db: AsyncSession = Depends(get_db)):
    # ── 1) HTTP Basic Auth (Payme spec) ─────────────────────────────────────
    auth = request.headers.get("Authorization", "")
    if not _check_basic_auth(auth, await _db_payme_keys(db)):
        # Payme spec: auth fail ham JSON-RPC error sifatida qaytariladi
        # (HTTP 200 va body ichida code -32504)
        try:
            body = await request.json()
            req_id = body.get("id")
        except Exception:
            req_id = None
        logger.warning("payme: basic auth failed")
        return _rpc_error(req_id, ERR_AUTH)

    # ── 2) JSON-RPC parse ───────────────────────────────────────────────────
    try:
        raw = await request.body()
        body = json.loads(raw.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _rpc_error(None, PaymeError(-32700, _msg(
            "JSON parse xatosi", "Ошибка JSON", "JSON parse error",
        )))

    if not isinstance(body, dict):
        return _rpc_error(None, PaymeError(-32600, _msg(
            "Noto'g'ri so'rov", "Неверный запрос", "Invalid request",
        )))

    req_id = body.get("id")
    method = body.get("method") or ""
    params = body.get("params") or {}
    if not isinstance(params, dict):
        params = {}

    _set_sentry_tags(payme_method=method)

    handler = METHOD_HANDLERS.get(method)
    if handler is None:
        return _rpc_error(req_id, PaymeError(-32601, _msg(
            f"Noma'lum method: {method}",
            f"Неизвестный метод: {method}",
            f"Method not found: {method}",
        )))

    # ── 3) Dispatch ─────────────────────────────────────────────────────────
    try:
        result = await handler(db, params)
        return _rpc_result(req_id, result)
    except PaymeError as e:
        # Account-spetsifik xatolarni log qilish (auth muvaffaqiyatli)
        if e.code in (-31050, -31051, -31052):
            logger.info(f"payme: {method} order error {e.code} params={params}")
        return _rpc_error(req_id, e)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception(f"payme: {method} unexpected error: {e}")
        return _rpc_error(req_id, PaymeError(-32400, _msg(
            "Server xatosi", "Системная ошибка", "Internal error",
        )))
