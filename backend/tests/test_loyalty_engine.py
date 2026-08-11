"""Loyalty engine — qoida baholash mantig'i testlari.

Bu eng kritik biznes-mantiq (har QR-skan ball hisoblaydi), shuning uchun
turli qoida turlari uchun aniqlik testlari.
"""
import pytest
import pytest_asyncio

from core.loyalty_engine import evaluate
from models import Card, LoyaltyRule, Merchant


@pytest_asyncio.fixture
async def merchant_card(db_session):
    m = Merchant(business_name="Test", email="loyalty@test.uz", password_hash="x")
    db_session.add(m)
    await db_session.flush()
    c = Card(merchant_id=m.id, card_uid="loyalty-uid-1", points=0, tier="bronze")
    db_session.add(c)
    await db_session.commit()
    return m, c


async def _add_rule(db, merchant_id, rule_type, config, priority=100):
    r = LoyaltyRule(
        merchant_id=merchant_id, rule_type=rule_type,
        config=config, is_active=True, priority=priority,
    )
    db.add(r)
    await db.commit()
    return r


@pytest.mark.asyncio
async def test_fallback_no_rules(db_session, merchant_card):
    """Qoida yo'q → fallback 1000 so'm = 1 ball."""
    m, c = merchant_card
    res = await evaluate(m.id, c, 5000, db_session)
    assert res.total_points == 5
    assert res.applied[0].rule_type == "classic_points"


@pytest.mark.asyncio
async def test_fallback_zero_amount_gives_one(db_session, merchant_card):
    """Qoida yo'q va summa 0 → kamida 1 ball."""
    m, c = merchant_card
    res = await evaluate(m.id, c, 0, db_session)
    assert res.total_points == 1


@pytest.mark.asyncio
async def test_classic_points_custom_rate(db_session, merchant_card):
    m, c = merchant_card
    await _add_rule(db_session, m.id, "classic_points", {"amount_per_point": 2000})
    res = await evaluate(m.id, c, 10000, db_session)
    assert res.total_points == 5  # 10000 // 2000


@pytest.mark.asyncio
async def test_per_visit_independent_of_amount(db_session, merchant_card):
    m, c = merchant_card
    await _add_rule(db_session, m.id, "per_visit", {"points_per_visit": 3})
    res = await evaluate(m.id, c, 0, db_session)
    assert res.total_points == 3


@pytest.mark.asyncio
async def test_cashback_percent(db_session, merchant_card):
    m, c = merchant_card
    await _add_rule(db_session, m.id, "cashback_percent", {"percent": 10})
    res = await evaluate(m.id, c, 10000, db_session)
    assert res.total_points == 1000  # 10% of 10000


@pytest.mark.asyncio
async def test_happy_hour_multiplies_base(db_session, merchant_card):
    """Happy hour bazaviy ballni ko'paytiradi (×2)."""
    m, c = merchant_card
    await _add_rule(db_session, m.id, "classic_points", {"amount_per_point": 1000})
    # Har kun, 0-24 soat → doim faol
    await _add_rule(
        db_session, m.id, "happy_hour",
        {"multiplier": 2, "days": [], "start_hour": 0, "end_hour": 23},
    )
    res = await evaluate(m.id, c, 10000, db_session)
    # base 10 × 2 = 20
    assert res.total_points == 20
