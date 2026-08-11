"""Admin transactions: recipient (kimga) + single transaction detail."""
import pytest
import pytest_asyncio

from core.security import create_admin_token
from models import Card, Merchant, Transaction, User


def _admin_headers():
    return {"Authorization": f"Bearer {create_admin_token({'sub': 'admin', 'role': 'super_admin'})}"}


@pytest_asyncio.fixture
async def tx_setup(db_session):
    u = User(name="Ali", phone="+998900000009")
    m = Merchant(business_name="Coffee", email="c@c.uz", password_hash="x")
    db_session.add_all([u, m])
    await db_session.flush()
    c = Card(merchant_id=m.id, user_id=u.id, card_uid="uid-detail-1", points=10)
    db_session.add(c)
    await db_session.flush()
    tx = Transaction(card_id=c.id, merchant_id=m.id, tx_type="earn",
                     points_delta=10, amount=12000, note="aksiya")
    db_session.add(tx)
    await db_session.commit()
    return u, m, c, tx


@pytest.mark.asyncio
async def test_list_includes_recipient(client, tx_setup):
    u, m, c, tx = tx_setup
    r = await client.get("/admin/transactions", headers=_admin_headers())
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["recipient"] == "Ali"


@pytest.mark.asyncio
async def test_transaction_detail(client, tx_setup):
    u, m, c, tx = tx_setup
    r = await client.get(f"/admin/transactions/{tx.id}", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == tx.id
    assert body["recipient"]["name"] == "Ali"
    assert body["merchant"]["business_name"] == "Coffee"
    assert body["card"]["card_uid"] == "uid-detail-1"
    assert body["note"] == "aksiya"


@pytest.mark.asyncio
async def test_transaction_detail_404(client, tx_setup):
    r = await client.get("/admin/transactions/999999", headers=_admin_headers())
    assert r.status_code == 404
