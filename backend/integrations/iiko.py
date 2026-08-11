"""iiko Cloud API integratsiyasi — bitta modulda parser, client, polling helperlar.

Hujjat: https://api-ru.iiko.services/

Komponentlar:
  - parse(body, headers, credentials) -> NormalizedSale | None
    Webhook parser (iiko OrderClosed/OrderCancelled hodisalari)
  - IikoClient(api_login, organization_id)  — REST + JWT auth client
  - IikoApiError              — xato turi
  - IikoCustomer, IikoOrder   — dataclass'lar
"""
from __future__ import annotations

from typing import Optional

from core.pos_engine import NormalizedSale


# Refund/cancel deb hisoblanadigan event turi nomlari (case-insensitive)
_REFUND_EVENTS = {
    "ordercancelled",
    "deliverycancelled",
    "orderdeleted",
    "transactioncancelled",
    "refundcreated",
    "billrefunded",
}
# Yopilgan/to'langan chek event turi nomlari
_EARN_EVENTS = {
    "orderclosed",
    "orderupdated",       # ba'zan paymentStatus=Paid bilan
    "deliveryclosed",
    "transactionclosed",
    "billclosed",
}


def _extract_data(body: dict) -> Optional[dict]:
    """Event payload'ni har xil sxema versiyalardan to'g'ri olish."""
    data = body.get("data") or body.get("payload")
    if isinstance(data, dict):
        return data
    if isinstance(body, dict) and "orderId" in body:
        return body
    return None


def _phone_from(data: dict) -> Optional[str]:
    """Telefon raqamini bir nechta joydan qidirib topish.

    Tartib: customer.phone → guests[0].phone → top-level phone. Hech qaysisi
    bo'lmasa, None — keyin pos_engine `customer_id` orqali iiko API'ga
    so'rov yuborib boyitishga harakat qiladi.
    """
    customer = data.get("customer")
    if isinstance(customer, dict):
        p = customer.get("phone") or customer.get("phoneNumber")
        if p:
            return str(p)
    guests = data.get("guests") or data.get("customers") or []
    if isinstance(guests, list):
        for g in guests:
            if isinstance(g, dict):
                p = g.get("phone") or g.get("phoneNumber")
                if p:
                    return str(p)
    return data.get("customerPhone") or data.get("phone")


def _customer_id_from(data: dict) -> Optional[str]:
    customer = data.get("customer")
    if isinstance(customer, dict):
        cid = customer.get("id") or customer.get("customerId")
        if cid:
            return str(cid)
    return data.get("customerId") or None


def _amount_from(data: dict) -> float:
    raw = data.get("sum") or data.get("totalSum") or data.get("amount") or 0
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def parse(body: dict, headers: dict, credentials: dict) -> Optional[NormalizedSale]:
    if not isinstance(body, dict):
        return None

    event_type = str(body.get("eventType") or body.get("event") or "").lower()
    data = _extract_data(body)
    if data is None:
        return None

    external_ref = (
        data.get("orderId")
        or data.get("order_id")
        or data.get("id")
        or data.get("transactionId")
    )
    if not external_ref:
        return None
    external_ref = str(external_ref)

    is_deleted = bool(data.get("isDeleted"))
    is_refund = is_deleted or event_type in _REFUND_EVENTS
    is_earn = (not is_refund) and (
        event_type in _EARN_EVENTS or event_type == ""  # legacy yoki noma'lum event — best-effort earn
    )

    if not (is_earn or is_refund):
        return None

    # Earn uchun paymentStatus tekshiruvi (mavjud bo'lsa)
    if is_earn:
        ps = str(data.get("paymentStatus") or "").lower()
        if ps and ps not in ("paid", "closed", ""):
            # To'liq to'lanmagan chekka ball bermaymiz
            return None

    amount = _amount_from(data)
    if amount <= 0 and is_earn:
        return None

    # Terminal id: branch mapping uchun
    terminal_id = (
        data.get("terminalGroupId")
        or data.get("terminalId")
        or body.get("terminalGroupId")
        or None
    )

    return NormalizedSale(
        external_ref=external_ref,
        amount=amount,
        phone=_phone_from(data),
        external_customer_id=_customer_id_from(data),
        external_terminal_id=str(terminal_id) if terminal_id else None,
        kind="refund" if is_refund else "earn",
        note="iiko",
    )


# ════════════════════════════════════════════════════════════════════════
# IIKO CLOUD API CLIENT
# ════════════════════════════════════════════════════════════════════════

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from loguru import logger


IIKO_BASE_URL = "https://api-ru.iiko.services"
TOKEN_TTL_SECONDS = 55 * 60          # iiko tokenlari 1 soat — biz 55 daq cache qilamiz
DEFAULT_TIMEOUT = 15.0
MAX_RETRIES = 3


class IikoApiError(Exception):
    """iiko API javobi muvaffaqiyatsiz bo'lganda ko'tariladi."""
    def __init__(self, status: int, body: str, *, endpoint: str = ""):
        self.status = status
        self.body = body[:400]
        self.endpoint = endpoint
        super().__init__(f"iiko API {status} on {endpoint}: {self.body}")


# ── Token cache (jarayon ichida shared) ─────────────────────────────────────
# {api_login: (token, expires_at_epoch)}
_token_cache: dict[str, tuple[str, float]] = {}


@dataclass
class IikoCustomer:
    id: str
    phone: Optional[str]
    name: str = ""
    birthday: Optional[datetime] = None


@dataclass
class IikoOrder:
    """Polling orqali olingan yopilgan chek."""
    order_id: str
    organization_id: str
    terminal_id: Optional[str]
    sum: float
    customer_id: Optional[str]
    customer_phone: Optional[str]
    closed_at: Optional[datetime]
    is_deleted: bool = False


class IikoClient:
    """Bitta merchant uchun async iiko mijozi.

    `apiLogin` orqali yaratiladi, kerakli `organization_id` bilan ishlaydi.
    """

    def __init__(
        self,
        api_login: str,
        organization_id: str,
        *,
        base_url: str = IIKO_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        if not api_login:
            raise ValueError("api_login bo'sh bo'lmasin")
        self.api_login = api_login
        self.organization_id = organization_id
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    # ── Lifecycle ───────────────────────────────────────────────────────────
    async def __aenter__(self) -> "IikoClient":
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
            raise RuntimeError("IikoClient `async with` ichida ishlatilishi kerak")
        return self._client

    # ── Token ───────────────────────────────────────────────────────────────
    async def get_token(self, *, force_refresh: bool = False) -> str:
        cached = _token_cache.get(self.api_login)
        now = time.time()
        if not force_refresh and cached and cached[1] > now + 30:
            return cached[0]

        client = self._ensure_client()
        try:
            r = await client.post("/api/1/access_token", json={"apiLogin": self.api_login})
        except httpx.HTTPError as e:
            raise IikoApiError(0, str(e), endpoint="/api/1/access_token") from e
        if r.status_code != 200:
            raise IikoApiError(r.status_code, r.text, endpoint="/api/1/access_token")
        data = r.json()
        token = data.get("token")
        if not token:
            raise IikoApiError(200, "token maydoni bo'sh", endpoint="/api/1/access_token")
        _token_cache[self.api_login] = (token, now + TOKEN_TTL_SECONDS)
        logger.debug(f"iiko: yangi token olindi (api_login={self.api_login[:8]}…)")
        return token

    def invalidate_token(self) -> None:
        _token_cache.pop(self.api_login, None)

    # ── Generic POST with auto-retry + auto-token-refresh ───────────────────
    async def _post(self, endpoint: str, payload: dict) -> dict:
        client = self._ensure_client()
        attempt = 0
        last_error: Optional[Exception] = None
        while attempt < MAX_RETRIES:
            attempt += 1
            try:
                token = await self.get_token(force_refresh=(attempt > 1 and isinstance(last_error, IikoApiError) and last_error.status == 401))
                r = await client.post(
                    endpoint,
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as e:
                last_error = e
                await asyncio.sleep(0.5 * (2 ** (attempt - 1)))
                continue
            if r.status_code == 401:
                # Token eskirgan — keyingi iteratsiya force_refresh qiladi
                last_error = IikoApiError(401, r.text, endpoint=endpoint)
                self.invalidate_token()
                continue
            if r.status_code in (429, 502, 503, 504):
                last_error = IikoApiError(r.status_code, r.text, endpoint=endpoint)
                await asyncio.sleep(0.7 * (2 ** (attempt - 1)))
                continue
            if r.status_code >= 400:
                raise IikoApiError(r.status_code, r.text, endpoint=endpoint)
            try:
                return r.json()
            except Exception as e:
                raise IikoApiError(r.status_code, f"JSON parse xatosi: {e}", endpoint=endpoint) from e

        if last_error:
            if isinstance(last_error, IikoApiError):
                raise last_error
            raise IikoApiError(0, str(last_error), endpoint=endpoint)
        raise IikoApiError(0, "noma'lum xato", endpoint=endpoint)

    # ── Public methods ──────────────────────────────────────────────────────
    async def list_organizations(self) -> list[dict]:
        """Connection test sifatida ham ishlatiladi."""
        data = await self._post("/api/1/organizations", {})
        orgs = data.get("organizations") or []
        return [
            {"id": o.get("id"), "name": o.get("name", "")}
            for o in orgs
            if o.get("id")
        ]

    async def list_terminals(self) -> list[dict]:
        """Mavjud terminallar — branch mapping uchun."""
        data = await self._post(
            "/api/1/terminal_groups",
            {"organizationIds": [self.organization_id]},
        )
        groups = data.get("terminalGroups") or []
        items: list[dict] = []
        for tg in groups:
            for t in (tg.get("items") or []):
                items.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "address": t.get("address", ""),
                })
        return items

    async def get_customer(self, customer_id: str) -> Optional[IikoCustomer]:
        if not customer_id:
            return None
        try:
            data = await self._post(
                "/api/1/customers/get_customer_by_id",
                {"organizationId": self.organization_id, "id": customer_id},
            )
        except IikoApiError as e:
            if e.status == 404:
                return None
            logger.warning(f"iiko: customer get xatolik {customer_id}: {e}")
            return None

        phone = (data.get("phone") or "").strip() or None
        if not phone:
            for card in (data.get("cards") or []):
                if isinstance(card, dict) and card.get("number"):
                    # Ba'zi merchantlar telefonni "card number" sifatida saqlaydi
                    n = str(card["number"]).strip()
                    if n.startswith("+") or n.isdigit():
                        phone = n
                        break

        bd_raw = data.get("birthday")
        bd = None
        if bd_raw:
            try:
                bd = datetime.fromisoformat(bd_raw.replace("Z", "+00:00"))
            except Exception:
                bd = None

        return IikoCustomer(
            id=customer_id,
            phone=phone,
            name=data.get("name") or "",
            birthday=bd,
        )

    async def update_webhooks_settings(self, *, webhook_url: str) -> bool:
        """Webhook URL va event filterlarini iiko tomonida ro'yxatdan o'tkazadi.

        iiko bu URL'ga `OrderClosed`, `OrderCancelled` va shunga o'xshash
        eventlarni POST qiladi.
        """
        payload = {
            "organizationId": self.organization_id,
            "webHooksUri": webhook_url,
            "authToken": "",  # auth iiko'da `Authorization` header orqali emas, query/body orqali ham emas — biz HMAC ishlatamiz
            "webHooksFilter": {
                "deliveryHooks": {"deliveryStatuses": ["Closed", "Cancelled"]},
                "stockHooks": {},
                "reserveHooks": {},
                "personalShiftHooks": {},
                "tableHooks": {},
            },
        }
        try:
            await self._post("/api/1/webhooks/update_settings", payload)
            return True
        except IikoApiError as e:
            logger.warning(f"iiko: webhook ro'yxatga olishdagi xato: {e}")
            return False

    async def fetch_orders_by_period(
        self,
        *,
        from_dt: datetime,
        to_dt: datetime,
        terminal_ids: Optional[list[str]] = None,
    ) -> list[IikoOrder]:
        """Berilgan vaqt oralig'idagi yopilgan cheklar.

        Polling worker tomonidan ishlatiladi — webhook tushib qolgan bo'lsa
        ham eski cheklar yig'iladi (idempotency mavjud).
        """
        payload: dict[str, Any] = {
            "organizationIds": [self.organization_id],
            "deliveryDateFrom": _iiko_dt(from_dt),
            "deliveryDateTo": _iiko_dt(to_dt),
            "statuses": ["Closed"],
        }
        if terminal_ids:
            payload["terminalGroupIds"] = terminal_ids

        try:
            data = await self._post("/api/1/deliveries/by_delivery_date", payload)
        except IikoApiError as e:
            logger.warning(f"iiko: polling fetch xato: {e}")
            return []

        out: list[IikoOrder] = []
        for ord_wrap in (data.get("orders") or []):
            order = ord_wrap.get("order") or ord_wrap
            if not isinstance(order, dict):
                continue
            order_id = order.get("id") or ord_wrap.get("id")
            if not order_id:
                continue
            customer = order.get("customer") or {}
            phone = customer.get("phone") if isinstance(customer, dict) else None
            customer_id = customer.get("id") if isinstance(customer, dict) else None
            sum_v = order.get("sum") or order.get("totalSum") or 0.0
            try:
                sum_v = float(sum_v)
            except (TypeError, ValueError):
                sum_v = 0.0
            if sum_v <= 0:
                continue
            closed_raw = order.get("closeTime") or order.get("whenClosed")
            closed_at = None
            if closed_raw:
                try:
                    closed_at = datetime.fromisoformat(str(closed_raw).replace("Z", "+00:00"))
                except Exception:
                    closed_at = None

            out.append(IikoOrder(
                order_id=str(order_id),
                organization_id=self.organization_id,
                terminal_id=order.get("terminalGroupId") or order.get("terminalId"),
                sum=sum_v,
                customer_id=customer_id,
                customer_phone=phone,
                closed_at=closed_at,
                is_deleted=bool(order.get("isDeleted")),
            ))
        return out


def _iiko_dt(dt: datetime) -> str:
    """iiko 'yyyy-MM-dd HH:mm:ss.fff' UTC formatini kutadi."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S.000")
