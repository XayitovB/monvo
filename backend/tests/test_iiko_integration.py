"""iiko parser, signature verifier va client (mocked) uchun testlar."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest

from core.pos_engine import NormalizedSale
from integrations import iiko as iiko_parser
from integrations._signatures import verify as verify_signature
from integrations._signatures import verify_iiko


# ════════════════════════════════════════════════════════════════════════════
# PARSER
# ════════════════════════════════════════════════════════════════════════════

def test_parse_order_closed_with_phone():
    body = {
        "eventType": "OrderClosed",
        "data": {
            "orderId": "abc-123",
            "sum": 125000.0,
            "guests": [{"phone": "+998901234567"}],
            "terminalGroupId": "term-1",
            "paymentStatus": "Paid",
        },
    }
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.external_ref == "abc-123"
    assert sale.amount == 125000.0
    assert sale.phone == "+998901234567"
    assert sale.kind == "earn"
    assert sale.external_terminal_id == "term-1"


def test_parse_customer_id_no_phone():
    """customerId bor, lekin phone yo'q — parser baribir return qiladi (enrichment uchun)."""
    body = {
        "eventType": "OrderClosed",
        "data": {
            "orderId": "ord-1",
            "sum": 50000,
            "customer": {"id": "cust-uuid-1"},
        },
    }
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.phone is None
    assert sale.external_customer_id == "cust-uuid-1"


def test_parse_refund_via_event_type():
    body = {
        "eventType": "OrderCancelled",
        "data": {"orderId": "ord-2", "sum": 30000, "guests": [{"phone": "+998900000000"}]},
    }
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.kind == "refund"


def test_parse_refund_via_is_deleted():
    body = {
        "eventType": "OrderClosed",
        "data": {"orderId": "ord-3", "sum": 30000, "isDeleted": True, "phone": "+998901111111"},
    }
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.kind == "refund"


def test_parse_unpaid_order_skipped():
    body = {
        "eventType": "OrderClosed",
        "data": {"orderId": "ord-4", "sum": 30000, "paymentStatus": "Unpaid"},
    }
    assert iiko_parser.parse(body, {}, {}) is None


def test_parse_zero_amount_skipped():
    body = {
        "eventType": "OrderClosed",
        "data": {"orderId": "ord-5", "sum": 0, "phone": "+998901234567"},
    }
    assert iiko_parser.parse(body, {}, {}) is None


def test_parse_missing_order_id():
    body = {"eventType": "OrderClosed", "data": {"sum": 1000}}
    assert iiko_parser.parse(body, {}, {}) is None


def test_parse_malformed_input():
    assert iiko_parser.parse(None, {}, {}) is None  # type: ignore
    assert iiko_parser.parse("not a dict", {}, {}) is None  # type: ignore
    assert iiko_parser.parse({}, {}, {}) is None
    assert iiko_parser.parse({"data": "not a dict"}, {}, {}) is None


def test_parse_legacy_top_level_phone():
    """customer/guests yo'q, top-level phone bor (legacy schema)."""
    body = {
        "data": {
            "orderId": "ord-6",
            "sum": 75000,
            "customerPhone": "+998905555555",
        },
    }
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.phone == "+998905555555"


def test_parse_unknown_event_falls_back_to_earn():
    """Event type bo'sh — earn deb qabul qilamiz (ko'p iiko deploy'lar shunday)."""
    body = {"data": {"orderId": "ord-7", "sum": 12000, "phone": "+998901234567"}}
    sale = iiko_parser.parse(body, {}, {})
    assert sale is not None
    assert sale.kind == "earn"


# ════════════════════════════════════════════════════════════════════════════
# HMAC SIGNATURE
# ════════════════════════════════════════════════════════════════════════════

def test_signature_hex_valid():
    body = b'{"eventType":"OrderClosed"}'
    secret = "topsecret"
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_iiko(body, {"x-iiko-signature": sig}, {"webhook_secret": secret}) is True


def test_signature_base64_valid():
    body = b'{"eventType":"OrderClosed"}'
    secret = "topsecret"
    sig = base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()
    assert verify_iiko(body, {"x-iiko-signature": sig}, {"webhook_secret": secret}) is True


def test_signature_invalid_rejected():
    body = b'{"x":1}'
    assert verify_iiko(body, {"x-iiko-signature": "deadbeef"}, {"webhook_secret": "s"}) is False


def test_signature_missing_with_secret_set_rejected():
    body = b'{"x":1}'
    assert verify_iiko(body, {}, {"webhook_secret": "s"}) is False


def test_signature_no_secret_legacy_passes():
    body = b'{"x":1}'
    assert verify_iiko(body, {}, {}) is True


def test_signature_dispatcher_unknown_provider_passes():
    """Provayder uchun verifier yo'q — True (legacy)."""
    assert verify_signature("billz", b"{}", {}, {}) is True


def test_signature_dispatcher_iiko_uses_iiko():
    """Dispatcher iiko'ga to'g'ri yo'naltiradi."""
    body = b'{"a":1}'
    secret = "k"
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature("iiko", body, {"x-iiko-signature": sig}, {"webhook_secret": secret}) is True
    assert verify_signature("iiko", body, {"x-iiko-signature": "wrong"}, {"webhook_secret": secret}) is False


# ════════════════════════════════════════════════════════════════════════════
# IIKO CLIENT (mocked httpx)
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_client_token_caching():
    """get_token bir marta API'ga chaqiriladi va cache'lanadi."""
    from integrations.iiko import IikoClient, _token_cache

    _token_cache.clear()

    fake_resp = AsyncMock()
    fake_resp.status_code = 200
    fake_resp.json = lambda: {"token": "tok-1"}

    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=fake_resp)) as mock_post:
        async with IikoClient("login-1", "org-1") as c:
            t1 = await c.get_token()
            t2 = await c.get_token()  # cache'dan
            assert t1 == "tok-1" == t2
            assert mock_post.call_count == 1  # ikkinchi chaqiruv cache'dan


@pytest.mark.asyncio
async def test_client_get_customer_returns_phone():
    from integrations.iiko import IikoClient, _token_cache

    _token_cache.clear()

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        if url == "/api/1/access_token":
            r.json = lambda: {"token": "tok"}
        elif url == "/api/1/customers/get_customer_by_id":
            r.json = lambda: {"phone": "+998900000000", "name": "Test"}
        else:
            r.json = lambda: {}
        return r

    with patch("httpx.AsyncClient.post", new=fake_post):
        async with IikoClient("login-x", "org-x") as c:
            cust = await c.get_customer("uuid-1")
            assert cust is not None
            assert cust.phone == "+998900000000"
            assert cust.name == "Test"


@pytest.mark.asyncio
async def test_client_list_organizations_validates_connection():
    from integrations.iiko import IikoClient, _token_cache

    _token_cache.clear()

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        r.status_code = 200
        if url == "/api/1/access_token":
            r.json = lambda: {"token": "tok"}
        elif url == "/api/1/organizations":
            r.json = lambda: {"organizations": [
                {"id": "org-1", "name": "Pizza House"},
                {"id": "org-2", "name": "Coffee Lab"},
            ]}
        else:
            r.json = lambda: {}
        return r

    with patch("httpx.AsyncClient.post", new=fake_post):
        async with IikoClient("login", "org-1") as c:
            orgs = await c.list_organizations()
            assert {o["id"] for o in orgs} == {"org-1", "org-2"}


@pytest.mark.asyncio
async def test_client_token_refresh_on_401():
    """401 kelsa, token yangilanib qayta urinish bo'ladi."""
    from integrations.iiko import IikoClient, _token_cache

    _token_cache.clear()
    call_log: list[str] = []

    async def fake_post(self, url, **kwargs):
        r = AsyncMock()
        call_log.append(url)
        if url == "/api/1/access_token":
            r.status_code = 200
            r.json = lambda: {"token": f"tok-{len([u for u in call_log if u == url])}"}
            return r
        # /api/1/organizations: birinchi marta 401, ikkinchi — 200
        attempts = [u for u in call_log if u == url]
        if len(attempts) == 1:
            r.status_code = 401
            r.text = "expired"
            return r
        r.status_code = 200
        r.json = lambda: {"organizations": [{"id": "org", "name": "X"}]}
        return r

    with patch("httpx.AsyncClient.post", new=fake_post):
        async with IikoClient("login", "org") as c:
            orgs = await c.list_organizations()
            assert orgs == [{"id": "org", "name": "X"}]
    # Token 2 marta olingan bo'lishi kerak (1 boshlang'ich + 1 refresh)
    assert call_log.count("/api/1/access_token") == 2
