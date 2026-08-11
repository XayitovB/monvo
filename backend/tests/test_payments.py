"""Admin billing payments endpoint testlari (real Payme to'lovlari tarixi)."""
import pytest

from core.security import create_admin_token


def _admin_headers():
    token = create_admin_token({"sub": "admin", "role": "super_admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_payments_list_empty(client):
    r = await client.get("/admin/billing/payments", headers=_admin_headers())
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_payments_summary_empty(client):
    r = await client.get("/admin/billing/payments/summary", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total_paid"] == 0
    assert body["paid_count"] == 0
    assert body["paying_merchants"] == 0


@pytest.mark.asyncio
async def test_payments_requires_admin(client):
    r = await client.get("/admin/billing/payments")
    assert r.status_code == 401
