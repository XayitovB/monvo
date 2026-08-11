"""OTP auth flow smoke tests.

We can't actually send SMS in tests; the backdoor OTP code ("123456" while
the TODO remains) is what these checks rely on. Once the backdoor is
removed, swap to a test-only override that writes a known code into
`phone_otps`.
"""
import pytest


@pytest.mark.asyncio
async def test_send_otp_new_phone(client):
    r = await client.post("/auth/phone/send-otp", json={"phone": "+998900000001"})
    assert r.status_code == 200
    assert "detail" in r.json() or "message" in r.json()


@pytest.mark.asyncio
async def test_verify_otp_wrong_code(client):
    # Send first so there's an OTP row to match against.
    await client.post("/auth/phone/send-otp", json={"phone": "+998900000002"})
    r = await client.post("/auth/phone/verify",
                          json={"phone": "+998900000002", "code": "000000"})
    # Either wrong code (400) or no OTP yet (race) — both are fine; must NOT 500.
    assert r.status_code in (400, 404)


@pytest.mark.asyncio
async def test_verify_otp_backdoor(client):
    """While the 123456 backdoor is active this should succeed; remove once
    the TODO(security) in routers/auth.py is cleaned up."""
    phone = "+998900000003"
    await client.post("/auth/phone/send-otp", json={"phone": phone})
    r = await client.post("/auth/phone/verify",
                          json={"phone": phone, "code": "123456", "name": "Smoke"})
    # 200 when backdoor enabled; 400 once removed.
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        body = r.json()
        assert "access_token" in body
