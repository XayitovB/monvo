"""BILLZ 2.0 client + parser + signature uchun testlar.

Eslatma: BILLZ 2 webhook qo'llab-quvvatlamasligi mumkin — biz polling rejimida
ishlatamiz. Shuning uchun parser/HMAC testlari saqlangan (kelajakda Billz
webhook qo'shsa, kod tayyor turadi), lekin client testlari yangi
BILLZ 2 REST + secret_token sxemasi bo'yicha qayta yozilgan.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from unittest.mock import AsyncMock, patch

import pytest

from integrations import billz as billz_parser
from integrations._signatures import verify as verify_signature
from integrations._signatures import verify_billz


# ════════════════════════════════════════════════════════════════════════════
# PARSER (kelajakda Billz webhook'lar uchun)
# ════════════════════════════════════════════════════════════════════════════

def test_parse_sale_created():
    body = {
        "event": "sale.created",
        "sale": {
            "id": "sale-1",
            "shop_id": "sh-1",
            "total": 125000,
            "customer": {"id": "cust-1", "phone": "+998901234567", "name": "Aziz"},
            "status": "completed",
        },
    }
    s = billz_parser.parse(body, {}, {})
    assert s is not None
    assert s.external_ref == "sale-1"
    assert s.amount == 125000.0
    assert s.phone == "+998901234567"
    assert s.kind == "earn"


def test_parse_refund_via_event():
    body = {"event": "sale.refunded", "sale": {"id": "s-3", "total": 30000, "customer": {"phone": "+998900000000"}}}
    s = billz_parser.parse(body, {}, {})
    assert s is not None
    assert s.kind == "refund"


def test_parse_zero_amount_skipped():
    body = {"event": "sale.created", "sale": {"id": "s-6", "total": 0}}
    assert billz_parser.parse(body, {}, {}) is None


def test_parse_malformed():
    assert billz_parser.parse(None, {}, {}) is None  # type: ignore
    assert billz_parser.parse({}, {}, {}) is None
    assert billz_parser.parse({"sale": "not a dict"}, {}, {}) is None


# ════════════════════════════════════════════════════════════════════════════
# HMAC SIGNATURE
# ════════════════════════════════════════════════════════════════════════════

def test_billz_signature_hex_valid():
    body = b'{"event":"sale.created"}'
    secret = "topsecret"
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_billz(body, {"x-billz-signature": sig}, {"webhook_secret": secret}) is True


def test_billz_signature_invalid_rejected():
    assert verify_billz(b"x", {"x-billz-signature": "deadbeef"}, {"webhook_secret": "k"}) is False


def test_dispatcher_routes_billz():
    body = b'{"a":1}'
    secret = "k"
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature("billz", body, {"x-billz-signature": sig}, {"webhook_secret": secret}) is True


# ════════════════════════════════════════════════════════════════════════════
# BILLZ 2 CLIENT (mocked httpx)
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_client_token_caching():
    """Token bir marta olinadi va cache'lanadi (auth + 1 ish chaqiruvi = 2 chaqiruv)."""
    from integrations.billz import BillzClient, _token_cache

    _token_cache.clear()
    auth_calls = 0

    async def fake_post(self, url, **kwargs):
        nonlocal auth_calls
        r = AsyncMock()
        r.status_code = 200
        r.text = "ok"
        if url == "/auth/login":
            auth_calls += 1
            r.json = lambda: {"data": {"access_token": "tok-1", "expires_in": 86400}}
        else:
            r.json = lambda: {}
        return r

    with patch("httpx.AsyncClient.post", new=fake_post):
        async with BillzClient("bllz_secret_xyz") as c:
            t1 = await c.get_token()
            t2 = await c.get_token()  # cache'dan
            assert t1 == "tok-1" == t2
            assert auth_calls == 1


@pytest.mark.asyncio
async def test_client_get_client_extracts_phone():
    from integrations.billz import BillzClient, _token_cache

    _token_cache.clear()

    async def fake_request(self, method, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        r.text = "ok"
        if url.startswith("/clients/"):
            r.json = lambda: {"data": {
                "id": "cust-1",
                "phone": "+998900000001",
                "name": "Test",
                "cashback_balance": 50000,
            }}
        else:
            r.json = lambda: {}
        return r

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        r.json = lambda: {"data": {"access_token": "tok", "expires_in": 86400}}
        return r

    with patch("httpx.AsyncClient.request", new=fake_request), \
         patch("httpx.AsyncClient.post", new=fake_post):
        async with BillzClient("bllz_secret_xyz") as c:
            cust = await c.get_client("cust-1")
            assert cust is not None
            assert cust.phone == "+998900000001"
            assert cust.cashback_balance == 50000.0


@pytest.mark.asyncio
async def test_client_list_sales_extracts_cashback():
    """Billz tomonidan hisoblangan cashback_amount to'g'ri olinadi."""
    from datetime import datetime, timezone

    from integrations.billz import BillzClient, _token_cache

    _token_cache.clear()

    async def fake_request(self, method, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        r.text = "ok"
        if url == "/sales":
            r.json = lambda: {"data": {"items": [
                {
                    "id": "sale-1",
                    "total": 125000,
                    "cashback_amount": 6250,
                    "customer": {"id": "cust-1", "phone": "+998900000001"},
                    "shop_id": "sh-1",
                    "status": "completed",
                    "closed_at": "2026-05-06T12:00:00Z",
                },
                {
                    "id": "sale-2",
                    "total": 30000,
                    "cashback": 1500,           # alias variant
                    "customer_phone": "+998900000002",
                    "status": "refunded",
                },
            ]}}
        else:
            r.json = lambda: {}
        return r

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        r.json = lambda: {"data": {"access_token": "tok", "expires_in": 86400}}
        return r

    with patch("httpx.AsyncClient.request", new=fake_request), \
         patch("httpx.AsyncClient.post", new=fake_post):
        async with BillzClient("bllz_secret_xyz") as c:
            sales = await c.list_sales(
                from_dt=datetime(2026, 5, 6, tzinfo=timezone.utc),
                to_dt=datetime(2026, 5, 7, tzinfo=timezone.utc),
            )
            assert len(sales) == 2
            assert sales[0].sale_id == "sale-1"
            assert sales[0].cashback_amount == 6250.0
            assert sales[0].customer_phone == "+998900000001"
            assert sales[0].is_refund is False
            assert sales[1].cashback_amount == 1500.0
            assert sales[1].is_refund is True


@pytest.mark.asyncio
async def test_client_token_refresh_on_401():
    """401 kelganda token yangilanib qayta urinish bo'ladi."""
    from integrations.billz import BillzClient, _token_cache

    _token_cache.clear()
    auth_calls = 0

    async def fake_post(self, url, **kwargs):
        nonlocal auth_calls
        r = AsyncMock()
        r.status_code = 200
        if url == "/auth/login":
            auth_calls += 1
            r.json = lambda: {"data": {"access_token": f"tok-{auth_calls}", "expires_in": 86400}}
        else:
            r.json = lambda: {}
        return r

    call_count = 0
    async def fake_request(self, method, url, **kwargs):
        nonlocal call_count
        call_count += 1
        r = AsyncMock()
        r.text = "ok"
        if call_count == 1:
            r.status_code = 401
            r.text = "expired"
        else:
            r.status_code = 200
            r.json = lambda: {"data": {"items": []}}
        return r

    with patch("httpx.AsyncClient.request", new=fake_request), \
         patch("httpx.AsyncClient.post", new=fake_post):
        async with BillzClient("bllz_secret_xyz") as c:
            from datetime import datetime, timezone
            sales = await c.list_sales(
                from_dt=datetime(2026, 5, 6, tzinfo=timezone.utc),
                to_dt=datetime(2026, 5, 7, tzinfo=timezone.utc),
            )
            assert sales == []
    assert auth_calls == 2  # 1 boshlang'ich + 1 refresh


@pytest.mark.asyncio
async def test_client_verify_token_works():
    from integrations.billz import BillzClient, _token_cache

    _token_cache.clear()

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        r.json = lambda: {"data": {"access_token": "tok-x", "expires_in": 86400}}
        return r

    with patch("httpx.AsyncClient.post", new=fake_post):
        async with BillzClient("bllz_secret_xyz") as c:
            assert await c.verify() is True
