"""Admin: foydalanuvchiga qo'lda tranzaksiya + user detail boyitishlari."""
import pytest
import pytest_asyncio

from core.security import create_admin_token
from models import Card, Merchant, User


def _admin_headers():
    return {"Authorization": f"Bearer {create_admin_token({'sub': 'admin', 'role': 'super_admin'})}"}


@pytest_asyncio.fixture
async def user_card(db_session):
    u = User(name="T", phone="+998900000001")
    m = Merchant(business_name="Shop", email="s@s.uz", password_hash="x")
    db_session.add_all([u, m])
    await db_session.flush()
    c = Card(merchant_id=m.id, user_id=u.id, card_uid="uid-tx-1", points=0)
    db_session.add(c)
    await db_session.commit()
    return u, m, c


@pytest.mark.asyncio
async def test_admin_add_earn_with_note(client, user_card):
    u, m, c = user_card
    r = await client.post(
        f"/admin/users/{u.id}/transactions",
        headers=_admin_headers(),
        json={"card_uid": "uid-tx-1", "tx_type": "earn", "points": 50, "note": "aksiya bonusi"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["points_delta"] == 50
    assert body["card_points"] == 50
    assert body["note"] == "aksiya bonusi"


@pytest.mark.asyncio
async def test_admin_redeem_insufficient_balance(client, user_card):
    u, m, c = user_card
    r = await client.post(
        f"/admin/users/{u.id}/transactions",
        headers=_admin_headers(),
        json={"card_uid": "uid-tx-1", "tx_type": "redeem", "points": 10, "note": ""},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_wrong_card_404(client, user_card):
    u, m, c = user_card
    r = await client.post(
        f"/admin/users/{u.id}/transactions",
        headers=_admin_headers(),
        json={"card_uid": "nope", "tx_type": "earn", "points": 5, "note": ""},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_user_detail_businesses_from_cards(client, user_card):
    """Tranzaksiyasiz ham karta bo'lsa biznes ko'rinadi + last_login_at kaliti bor."""
    u, m, c = user_card
    r = await client.get(f"/admin/users/{u.id}", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["totals"]["merchants_count"] == 1
    assert body["merchants"][0]["merchant_name"] == "Shop"
    assert "last_login_at" in body["user"]
    assert "created_at" in body["cards"][0]
