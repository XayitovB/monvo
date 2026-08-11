"""Payme JSON-RPC integratsiyasi uchun testlar.

Asosiy stsenariylar:
  - HTTP Basic auth (Paycom:KEY) — to'g'ri, noto'g'ri, yo'q
  - CheckPerformTransaction (mavjud va mavjud emas invoice)
  - CreateTransaction (yangi va idempotent)
  - PerformTransaction (idempotent)
  - CancelTransaction (1 → -1, 2 → -2)
  - CheckTransaction
  - GetStatement
  - Amount mismatch va order paid xatolari
  - Subscription auto-extension on perform
"""
from __future__ import annotations

import base64
import os

# Test kalitlari conftest yuklanishidan oldin o'rnatilishi shart
os.environ.setdefault("PAYME_MERCHANT_ID", "test_merchant")
os.environ.setdefault("PAYME_KEY", "test_key_production")
os.environ.setdefault("PAYME_TEST_KEY", "test_key_sandbox")

import pytest
import pytest_asyncio
from sqlalchemy import select


PAYME_PATH = "/payme/merchant"


def _basic(key: str = "test_key_production") -> str:
    return "Basic " + base64.b64encode(f"Paycom:{key}".encode()).decode()


def _rpc(method: str, params: dict, req_id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}


@pytest_asyncio.fixture
async def merchant_with_invoice(db_session):
    """Aktiv merchant + plan + pending invoice yaratadi."""
    from datetime import datetime, timedelta, timezone
    from models import BillingPlan, Invoice, Merchant

    merchant = Merchant(
        business_name="Test Biz",
        business_email="biz@test.uz",
        password_hash="x",
        phone="+998900000000",
        is_active=True,
    )
    db_session.add(merchant)
    await db_session.flush()

    plan = BillingPlan(
        key="business",
        name="Business",
        price_monthly=349_000,
        is_active=True,
    )
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    invoice = Invoice(
        merchant_id=merchant.id,
        plan_id=plan.id,
        invoice_number="TEST-001",
        amount=349_000,
        currency="UZS",
        status="pending",
        period_start=now,
        period_end=now + timedelta(days=30),
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return {"merchant": merchant, "plan": plan, "invoice": invoice}


# ════════════════════════════════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_auth_missing_returns_32504(client):
    r = await client.post(PAYME_PATH, json=_rpc("CheckPerformTransaction", {}))
    body = r.json()
    assert r.status_code == 200
    assert body["error"]["code"] == -32504


@pytest.mark.asyncio
async def test_auth_wrong_key_rejected(client):
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {}),
        headers={"Authorization": _basic("WRONG")},
    )
    assert r.json()["error"]["code"] == -32504


@pytest.mark.asyncio
async def test_auth_test_key_accepted(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {
            "amount": int(float(inv.amount) * 100),
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic("test_key_sandbox")},
    )
    assert r.json().get("result", {}).get("allow") is True


@pytest.mark.asyncio
async def test_unknown_method_returns_32601(client):
    r = await client.post(
        PAYME_PATH,
        json=_rpc("DoesNotExist", {}),
        headers={"Authorization": _basic()},
    )
    assert r.json()["error"]["code"] == -32601


# ════════════════════════════════════════════════════════════════════════════
# CheckPerformTransaction
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_check_perform_ok(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {
            "amount": int(float(inv.amount) * 100),
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    assert r.json()["result"]["allow"] is True


@pytest.mark.asyncio
async def test_check_perform_unknown_order(client):
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {
            "amount": 100,
            "account": {"order_id": 999999},
        }),
        headers={"Authorization": _basic()},
    )
    assert r.json()["error"]["code"] == -31050


@pytest.mark.asyncio
async def test_check_perform_amount_mismatch(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {
            "amount": 100,  # invoice 349000 so'm = 34900000 tiyin, biz 100 yubordik
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    assert r.json()["error"]["code"] == -31001


# ════════════════════════════════════════════════════════════════════════════
# CreateTransaction → PerformTransaction (full happy path + idempotency)
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_full_flow_create_perform(client, db_session, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    amount_tiyin = int(float(inv.amount) * 100)
    paycom_id = "tx-abc-123"

    # 1. Create
    r1 = await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": paycom_id,
            "time": 1_700_000_000_000,
            "amount": amount_tiyin,
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    res1 = r1.json()["result"]
    assert res1["state"] == 1
    assert "transaction" in res1

    # Idempotent: bir xil id qayta kelsa bir xil javob
    r1b = await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": paycom_id,
            "time": 1_700_000_000_000,
            "amount": amount_tiyin,
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    assert r1b.json()["result"]["transaction"] == res1["transaction"]

    # 2. Perform
    r2 = await client.post(
        PAYME_PATH,
        json=_rpc("PerformTransaction", {"id": paycom_id}),
        headers={"Authorization": _basic()},
    )
    res2 = r2.json()["result"]
    assert res2["state"] == 2
    assert res2["perform_time"] > 0

    # Idempotent perform
    r2b = await client.post(
        PAYME_PATH,
        json=_rpc("PerformTransaction", {"id": paycom_id}),
        headers={"Authorization": _basic()},
    )
    assert r2b.json()["result"]["state"] == 2

    # 3. Invoice endi paid
    from models import Invoice, MerchantSubscription
    refreshed = (await db_session.execute(
        select(Invoice).where(Invoice.id == inv.id)
    )).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.status == "paid"
    assert refreshed.paid_at is not None

    # 4. Subscription auto-yaratilgan
    sub = (await db_session.execute(
        select(MerchantSubscription).where(
            MerchantSubscription.merchant_id == merchant_with_invoice["merchant"].id
        )
    )).scalar_one()
    assert sub.status == "active"
    assert sub.expires_at is not None


# ════════════════════════════════════════════════════════════════════════════
# CancelTransaction
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cancel_before_perform(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    paycom_id = "tx-cancel-1"

    await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": paycom_id,
            "time": 1_700_000_000_000,
            "amount": int(float(inv.amount) * 100),
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )

    r = await client.post(
        PAYME_PATH,
        json=_rpc("CancelTransaction", {"id": paycom_id, "reason": 3}),
        headers={"Authorization": _basic()},
    )
    res = r.json()["result"]
    assert res["state"] == -1
    assert res["cancel_time"] > 0


@pytest.mark.asyncio
async def test_cancel_after_perform_refunds_invoice(client, db_session, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    paycom_id = "tx-refund-1"
    amount_tiyin = int(float(inv.amount) * 100)

    await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": paycom_id, "time": 1_700_000_000_000,
            "amount": amount_tiyin, "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    await client.post(
        PAYME_PATH,
        json=_rpc("PerformTransaction", {"id": paycom_id}),
        headers={"Authorization": _basic()},
    )

    r = await client.post(
        PAYME_PATH,
        json=_rpc("CancelTransaction", {"id": paycom_id, "reason": 5}),
        headers={"Authorization": _basic()},
    )
    assert r.json()["result"]["state"] == -2

    from models import Invoice
    refreshed = (await db_session.execute(select(Invoice).where(Invoice.id == inv.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.status == "refunded"


# ════════════════════════════════════════════════════════════════════════════
# CheckTransaction + GetStatement
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_check_transaction_returns_state(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    paycom_id = "tx-check-1"
    await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": paycom_id, "time": 1_700_000_000_000,
            "amount": int(float(inv.amount) * 100), "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckTransaction", {"id": paycom_id}),
        headers={"Authorization": _basic()},
    )
    res = r.json()["result"]
    assert res["state"] == 1
    assert res["create_time"] > 0
    assert res["perform_time"] == 0


@pytest.mark.asyncio
async def test_check_transaction_not_found(client):
    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckTransaction", {"id": "nope"}),
        headers={"Authorization": _basic()},
    )
    assert r.json()["error"]["code"] == -31003


@pytest.mark.asyncio
async def test_get_statement_returns_transactions(client, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    await client.post(
        PAYME_PATH,
        json=_rpc("CreateTransaction", {
            "id": "stmt-1", "time": 1_700_000_500_000,
            "amount": int(float(inv.amount) * 100), "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    r = await client.post(
        PAYME_PATH,
        json=_rpc("GetStatement", {"from": 1_700_000_000_000, "to": 1_700_001_000_000}),
        headers={"Authorization": _basic()},
    )
    txs = r.json()["result"]["transactions"]
    assert len(txs) == 1
    assert txs[0]["id"] == "stmt-1"


# ════════════════════════════════════════════════════════════════════════════
# Order state transitions
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_check_perform_order_already_paid(client, db_session, merchant_with_invoice):
    inv = merchant_with_invoice["invoice"]
    inv.status = "paid"
    await db_session.commit()

    r = await client.post(
        PAYME_PATH,
        json=_rpc("CheckPerformTransaction", {
            "amount": int(float(inv.amount) * 100),
            "account": {"order_id": inv.id},
        }),
        headers={"Authorization": _basic()},
    )
    assert r.json()["error"]["code"] == -31051


# ════════════════════════════════════════════════════════════════════════════
# Checkout URL builder
# ════════════════════════════════════════════════════════════════════════════

def test_checkout_url_builder():
    from core.payme import build_checkout_url

    url = build_checkout_url(
        merchant_id="abc123",
        invoice_id=42,
        amount_sum=349_000,
        base_url="https://checkout.paycom.uz",
        lang="uz",
    )
    assert url.startswith("https://checkout.paycom.uz/")
    encoded = url.rsplit("/", 1)[1]
    decoded = base64.b64decode(encoded).decode()
    assert "m=abc123" in decoded
    assert "ac.order_id=42" in decoded
    assert "a=34900000" in decoded
    assert "l=uz" in decoded
