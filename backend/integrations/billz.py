"""BILLZ 2.0 integratsiyasi — bitta modulda parser, client, polling helperlar.

Hujjat: https://billzuz.notion.site/API-c2f91aa254f94f8eb7c1b26415dcb25b
Base URL: https://api-admin.billz.ai/v1

Komponentlar:
  - parse(body, headers, credentials) -> NormalizedSale | None
    Webhook parser (kelajakda Billz webhook qo'shsa). Hozir Billz 2
    webhook qo'llab-quvvatlamaydi — polling rejimi ishlatiladi.
  - BillzClient(secret_token)  — REST + JWT auth client
  - BillzApiError              — xato turi
  - BillzClient2Customer       — mijoz ma'lumoti dataclass
  - BillzSale                  — sotuv ma'lumoti dataclass
"""
from __future__ import annotations

from __future__ import annotations

from typing import Optional

from core.pos_engine import NormalizedSale


# Refund/cancel deb hisoblanadigan event/status nomlari (case-insensitive)
_REFUND_EVENTS = {
    "sale.refunded",
    "sale.cancelled",
    "sale.canceled",
    "sale.deleted",
    "refund.created",
}
_REFUND_STATUSES = {
    "refunded",
    "cancelled",
    "canceled",
    "refund",
    "deleted",
}
_EARN_EVENTS = {
    "sale.created",
    "sale.completed",
    "sale.closed",
    "sale.paid",
}


def _extract_sale(body: dict) -> Optional[dict]:
    """Sale obyektini har xil sxema versiyalardan to'g'ri olish."""
    sale = body.get("sale") or body.get("data") or body.get("payload")
    if isinstance(sale, dict):
        return sale
    if isinstance(body, dict) and ("id" in body or "sale_id" in body) and "total" in body:
        return body
    return None


def _phone_from(sale: dict) -> Optional[str]:
    customer = sale.get("customer")
    if isinstance(customer, dict):
        p = (
            customer.get("phone")
            or customer.get("phone_number")
            or customer.get("mobile")
        )
        if p:
            return str(p)
    return sale.get("customer_phone") or sale.get("phone")


def _customer_id_from(sale: dict) -> Optional[str]:
    customer = sale.get("customer")
    if isinstance(customer, dict):
        cid = customer.get("id") or customer.get("customer_id") or customer.get("uuid")
        if cid:
            return str(cid)
    return sale.get("customer_id") or None


def _amount_from(sale: dict) -> float:
    raw = (
        sale.get("total")
        or sale.get("amount")
        or sale.get("grand_total")
        or sale.get("total_amount")
        or 0
    )
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    if not isinstance(body, dict):
        return None

    event_type = str(body.get("event") or body.get("eventType") or body.get("type") or "").lower()
    sale = _extract_sale(body)
    if sale is None:
        return None

    external_ref = (
        sale.get("id")
        or sale.get("sale_id")
        or sale.get("uuid")
        or body.get("id")
    )
    if not external_ref:
        return None
    external_ref = str(external_ref)

    status = str(sale.get("status") or "").lower()
    is_refund_event = event_type in _REFUND_EVENTS
    is_refund_status = status in _REFUND_STATUSES
    is_refund = is_refund_event or is_refund_status or bool(sale.get("refunded")) or bool(sale.get("is_refund"))

    is_earn = (not is_refund) and (
        event_type in _EARN_EVENTS or event_type == "" or status in ("completed", "closed", "paid", "")
    )

    if not (is_earn or is_refund):
        return None

    amount = _amount_from(sale)
    if amount <= 0 and is_earn:
        return None

    return NormalizedSale(
        external_ref=external_ref,
        amount=amount,
        phone=_phone_from(sale),
        external_customer_id=_customer_id_from(sale),
        external_terminal_id=str(sale.get("shop_id")) if sale.get("shop_id") else None,
        kind="refund" if is_refund else "earn",
        note="Billz",
    )


# ════════════════════════════════════════════════════════════════════════
# BILLZ 2.0 REST CLIENT
# ════════════════════════════════════════════════════════════════════════

import asyncio
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from loguru import logger


BILLZ_BASE_URL = os.environ.get("BILLZ_BASE_URL", "https://api-admin.billz.ai").rstrip("/")
DEFAULT_TIMEOUT = 15.0
MAX_RETRIES = 3
# Token TTL — Billz 86400s yuboradi, biz 5 daq xavfsizlik marjasi qo'yamiz
TOKEN_TTL_FALLBACK_SECONDS = 24 * 3600


class BillzApiError(Exception):
    def __init__(self, status: int, body: str, *, endpoint: str = ""):
        self.status = status
        self.body = body[:400]
        self.endpoint = endpoint
        super().__init__(f"Billz API {status} on {endpoint}: {self.body}")


# Token cache: {secret_token_first_12: (jwt, expires_at_epoch)}
_token_cache: dict[str, tuple[str, float]] = {}


@dataclass
class BillzClient2Customer:
    id: str
    phone: Optional[str]
    name: str = ""
    cashback_balance: float = 0.0


@dataclass
class BillzSale:
    sale_id: str
    shop_id: Optional[str]
    total: float
    cashback_amount: float          # Billz hisoblagan (accrued)
    cashback_spent: float           # Mijoz ushbu chekda sarflagan cashback (redeemed)
    customer_id: Optional[str]
    customer_phone: Optional[str]
    closed_at: Optional[datetime]
    is_refund: bool = False


def _pick(d: dict, *keys, default=None):
    """Birinchi mavjud kalitni qaytaradi (Billz turli versiyalarda boshqacha nom)."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _to_float(x) -> float:
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_iso(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _company_id_from_jwt(token: str) -> Optional[str]:
    """Decode the JWT *without* verification and pull `company_id` out of the
    payload. Billz embeds the company UUID in the access token, so we do not
    need to ask the merchant for it separately.
    """
    if not token or token.count(".") != 2:
        return None
    import base64 as _b64
    import json as _json
    try:
        payload_b64 = token.split(".")[1]
        # Pad for urlsafe base64
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        raw = _b64.urlsafe_b64decode(padded.encode())
        payload = _json.loads(raw)
        cid = payload.get("company_id")
        return str(cid) if cid else None
    except Exception:
        return None


class BillzClient:
    """BILLZ 2 async client.

    Foydalanish:
        async with BillzClient(secret_token="bllz_sk_...") as c:
            sales = await c.list_sales(from_dt=..., to_dt=...)
    """

    def __init__(
        self,
        secret_token: str,
        *,
        base_url: str = BILLZ_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        if not secret_token:
            raise ValueError("secret_token bo'sh bo'lmasin")
        self.secret_token = secret_token
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        # JWT'dan login paytida ajratib olinadi
        self._company_id: Optional[str] = None

    @property
    def _cache_key(self) -> str:
        # Tokeningni cache key sifatida qisqartirish (xavfsizroq)
        return self.secret_token[:12]

    async def __aenter__(self) -> "BillzClient":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(self.timeout),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        return self

    async def __aexit__(self, *exc) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("BillzClient `async with` ichida ishlatilishi kerak")
        return self._client

    # ── Auth ──────────────────────────────────────────────────────────────
    async def get_token(self, *, force_refresh: bool = False) -> str:
        cached = _token_cache.get(self._cache_key)
        now = time.time()
        if not force_refresh and cached and cached[1] > now + 30:
            # Cache hit — JWT'dan company_id ni ham tiklash
            if not self._company_id:
                self._company_id = _company_id_from_jwt(cached[0])
            return cached[0]

        client = self._ensure_client()
        try:
            r = await client.post(
                "/v1/auth/login",
                json={"secret_token": self.secret_token},
            )
        except httpx.HTTPError as e:
            raise BillzApiError(0, str(e), endpoint="/v1/auth/login") from e

        if r.status_code != 200:
            raise BillzApiError(r.status_code, r.text, endpoint="/v1/auth/login")
        try:
            data = r.json()
        except Exception as e:
            raise BillzApiError(200, f"JSON parse: {e}", endpoint="/v1/auth/login") from e

        # Billz 2 javob shakli: { code, message, error, data: {access_token, expires_in} }
        # Lekin defensiv — to'g'ridan-to'g'ri ham qabul qilamiz
        wrap = data.get("data") if isinstance(data.get("data"), dict) else data
        token = _pick(wrap, "access_token", "token", "jwt")
        expires = int(_pick(wrap, "expires_in", default=TOKEN_TTL_FALLBACK_SECONDS))

        if not token:
            raise BillzApiError(200, "access_token kelmadi", endpoint="/v1/auth/login")

        # JWT payload'idan company_id ajratib olamiz (auto-discovery)
        self._company_id = _company_id_from_jwt(token)

        _token_cache[self._cache_key] = (token, now + max(60, expires - 300))
        logger.debug(f"billz: yangi token (expires_in={expires}s, company={self._company_id[:8] if self._company_id else '-'}...)")
        return token

    async def get_company_id(self) -> Optional[str]:
        """JWT'dan ajratib olingan company_id (login chaqirilgan bo'lishi kerak)."""
        if not self._company_id:
            await self.get_token()
        return self._company_id

    def invalidate_token(self) -> None:
        _token_cache.pop(self._cache_key, None)

    # ── Generic request ───────────────────────────────────────────────────
    async def _request(
        self,
        method: str,
        endpoint: str,
        *,
        params: Optional[dict] = None,
        json_body: Optional[dict] = None,
    ) -> dict:
        client = self._ensure_client()
        last_error: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            try:
                token = await self.get_token(
                    force_refresh=(
                        attempt > 0
                        and isinstance(last_error, BillzApiError)
                        and last_error.status == 401
                    ),
                )
                r = await client.request(
                    method,
                    endpoint,
                    json=json_body,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as e:
                last_error = e
                await asyncio.sleep(0.5 * (2 ** attempt))
                continue
            if r.status_code == 401:
                last_error = BillzApiError(401, r.text, endpoint=endpoint)
                self.invalidate_token()
                continue
            if r.status_code in (429, 502, 503, 504):
                last_error = BillzApiError(r.status_code, r.text, endpoint=endpoint)
                await asyncio.sleep(0.7 * (2 ** attempt))
                continue
            if r.status_code >= 400:
                raise BillzApiError(r.status_code, r.text, endpoint=endpoint)
            try:
                return r.json() if r.text else {}
            except Exception as e:
                raise BillzApiError(r.status_code, f"JSON parse: {e}", endpoint=endpoint) from e

        if last_error:
            if isinstance(last_error, BillzApiError):
                raise last_error
            raise BillzApiError(0, str(last_error), endpoint=endpoint)
        raise BillzApiError(0, "noma'lum xato", endpoint=endpoint)

    async def _get(self, endpoint: str, *, params: Optional[dict] = None) -> dict:
        return await self._request("GET", endpoint, params=params)

    async def _post(self, endpoint: str, payload: dict) -> dict:
        return await self._request("POST", endpoint, json_body=payload)

    # ── Public methods ────────────────────────────────────────────────────

    PLATFORM_ID = "7d4a4c38-dd84-4902-b744-0488b80a4c01"

    async def _request_with_channel(
        self,
        method: str,
        endpoint: str,
        *,
        json_body: Optional[dict] = None,
    ) -> dict:
        """Billz-Response-Channel: HTTP header talab qiladigan endpointlar uchun."""
        client = self._ensure_client()
        last_error: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            try:
                token = await self.get_token(
                    force_refresh=(
                        attempt > 0
                        and isinstance(last_error, BillzApiError)
                        and last_error.status == 401
                    ),
                )
                r = await client.request(
                    method,
                    endpoint,
                    json=json_body,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Billz-Response-Channel": "HTTP",
                        "platform-id": self.PLATFORM_ID,
                    },
                )
            except httpx.HTTPError as e:
                last_error = e
                await asyncio.sleep(0.5 * (2 ** attempt))
                continue
            if r.status_code == 401:
                last_error = BillzApiError(401, r.text, endpoint=endpoint)
                self.invalidate_token()
                continue
            if r.status_code in (429, 502, 503, 504):
                last_error = BillzApiError(r.status_code, r.text, endpoint=endpoint)
                await asyncio.sleep(0.7 * (2 ** attempt))
                continue
            if r.status_code >= 400:
                raise BillzApiError(r.status_code, r.text, endpoint=endpoint)
            try:
                return r.json() if r.text else {}
            except Exception as e:
                raise BillzApiError(r.status_code, f"JSON parse: {e}", endpoint=endpoint) from e
        if last_error:
            if isinstance(last_error, BillzApiError):
                raise last_error
            raise BillzApiError(0, str(last_error), endpoint=endpoint)
        raise BillzApiError(0, "noma'lum xato", endpoint=endpoint)

    async def create_gift_cards(
        self,
        *,
        cards: list[dict],
        card_type: str = "VOUCHER",
        expire_type: str = "ABSOLUTE",
        is_activated: bool = True,
    ) -> dict:
        """Billz'da voucher/sertifikat yaratadi.

        `cards` — har biri `{code, amount, expire_period}` bo'lgan ro'yxat.
        `expire_period` — "DD.MM.YYYY" formatida sana (masalan "31.12.2027").

        Testlangan kombinatsiya: card_type=VOUCHER, expire_type=ABSOLUTE.
        use_type va id=0 parametrlari Billz'da 500 xatoga olib keladi — qo'shilmaydi.

        Qaytaradi: {data: import_id, status_code, error, topic, ...}
        HTTP 200 qaytsa ham JSON ichidagi status_code tekshiriladi.
        """
        payload = {
            "is_activated": is_activated,
            "gift_cards": cards,
            "card_type": card_type,
            "expire_type": expire_type,
        }
        resp = await self._request_with_channel(
            "POST", "/v1/gift-card/activate-list", json_body=payload
        )
        # Billz har doim HTTP 200 qaytaradi — muvaffaqiyatsizlikni JSON ichidan aniqlaymiz
        inner_code = resp.get("status_code", 200)
        if inner_code != 200:
            err = (resp.get("error") or {}).get("message") or f"status_code={inner_code}"
            raise BillzApiError(inner_code, err, endpoint="/v1/gift-card/activate-list")
        return resp

    async def verify(self) -> bool:
        """Token ishlayotganini tekshiradi (connection test)."""
        try:
            await self.get_token(force_refresh=True)
            return True
        except BillzApiError:
            return False

    async def get_client(self, client_id: str) -> Optional[BillzClient2Customer]:
        """Mijozning to'liq ma'lumoti (telefon, ism, cashback balansi)."""
        if not client_id:
            return None
        try:
            data = await self._get(f"/v1/clients/{client_id}")
        except BillzApiError as e:
            if e.status == 404:
                return None
            logger.warning(f"billz: get_client {client_id} xato: {e}")
            return None

        # Billz 2 javob ko'pincha {data: {...}} ko'rinishida o'ralgan
        c = data.get("data") if isinstance(data.get("data"), dict) else data
        if not isinstance(c, dict):
            return None
        return BillzClient2Customer(
            id=str(_pick(c, "id", "client_id", "uuid", default=client_id)),
            phone=_pick(c, "phone", "phone_number", "mobile"),
            name=_pick(c, "name", "full_name", default="") or "",
            cashback_balance=_to_float(_pick(c, "cashback_balance", "cashback", "balance", default=0)),
        )

    async def list_sales(
        self,
        *,
        from_dt: datetime,
        to_dt: datetime,
        limit: int = 200,
    ) -> list[BillzSale]:
        """Berilgan oraliqdagi yopilgan cheklar.

        Endpoint: GET /v3/order-search
        company_id JWT'dan avtomatik ajratib olinadi.
        Date format: YYYY-MM-DD (oddiy sana — Billz UTC sanani kutadi).

        Har bir chekda:
          - mijoz id (order_detail.customer)
          - to'lov summasi (order_detail.total_price)
          - **Billz hisoblagan cashback** (order_detail.with_cashback)
        """
        company_id = await self.get_company_id()
        if not company_id:
            logger.warning("billz: list_sales — company_id JWT'dan ajratilmadi")
            return []

        params: dict[str, Any] = {
            "company_id": company_id,
            "start_date": from_dt.strftime("%Y-%m-%d"),
            "end_date":   to_dt.strftime("%Y-%m-%d"),
            "limit": limit,
            "page": 1,
        }
        try:
            data = await self._get("/v3/order-search", params=params)
        except BillzApiError as e:
            logger.warning(f"billz: list_sales xato: {e}")
            return []

        # Response: { count, orders_sorted_by_date_list: [{date, orders: [...]}] }
        groups = data.get("orders_sorted_by_date_list") or []
        if not isinstance(groups, list):
            groups = []

        out: list[BillzSale] = []
        for grp in groups:
            if not isinstance(grp, dict):
                continue
            for it in grp.get("orders") or []:
                if not isinstance(it, dict):
                    continue
                sid = _pick(it, "id", "order_number")
                if not sid:
                    continue

                detail = it.get("order_detail") or {}
                total = _to_float(_pick(detail, "total_price", default=0))
                if total <= 0:
                    continue

                customer = detail.get("customer") or {}
                # customer_id eng ishonchli order_detail ichida (top-level ko'pincha "" bo'sh)
                cust_id = (
                    _pick(detail, "customer_id")
                    or (_pick(customer, "id") if isinstance(customer, dict) else None)
                    or _pick(it, "customer_id")
                )
                # Telefon: Billz `phone_numbers` massivini qaytaradi
                cust_phone = None
                if isinstance(customer, dict):
                    pnums = customer.get("phone_numbers")
                    if isinstance(pnums, list) and pnums:
                        cust_phone = pnums[0]
                    if not cust_phone:
                        cust_phone = _pick(customer, "phone", "phone_number", "mobile")

                # Billz hisoblagan cashback (earned)
                cashback = _to_float(_pick(
                    detail, "with_cashback", "loyalty_balance_income",
                    default=0,
                ))
                # Mijoz ushbu chekda sarflagan cashback (spent/redeemed)
                cashback_spent = _to_float(_pick(
                    detail, "loyalty_balance_outcome", "paid_by_cashback",
                    "paid_by_bonus", "cashback_outcome",
                    default=0,
                ))

                closed_at = _parse_iso(_pick(it, "sold_at", "finished_at", "display_sold_at"))

                # Refund/cancel signal
                order_type = str(_pick(it, "order_type", default="")).upper()
                is_refund = bool(it.get("deleted")) or order_type in ("RETURN", "REFUND", "CANCELLED")

                out.append(BillzSale(
                    sale_id=str(sid),
                    shop_id=str(_pick(detail, "shop_id") or "") or None,
                    total=total,
                    cashback_amount=max(0.0, cashback),
                    cashback_spent=max(0.0, cashback_spent),
                    customer_id=str(cust_id) if cust_id else None,
                    customer_phone=str(cust_phone) if cust_phone else None,
                    closed_at=closed_at,
                    is_refund=is_refund,
                ))
        return out


def _billz_dt(dt: datetime) -> str:
    """Billz ISO 8601 UTC kutadi."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
