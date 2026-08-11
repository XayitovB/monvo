"""Smoke tests — confirm basic infrastructure is wired up.

These are intentionally shallow; they catch catastrophic regressions (import
errors, routing collisions, schema drift) rather than validate deep business
logic. Grow the suite as real bugs appear.
"""
import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


@pytest.mark.asyncio
async def test_api_root(client):
    r = await client.get("/api")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_app_config_public(client):
    r = await client.get("/app-config")
    assert r.status_code == 200
    data = r.json()
    assert "app_name" in data
    assert "logo_url" in data
    assert "primary_color" in data


@pytest.mark.asyncio
async def test_links_public(client):
    r = await client.get("/links")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_announcements_public_empty(client):
    r = await client.get("/announcements/active?target=users")
    # Either 200 (with list) or 404 if table absent in test DB
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_admin_login_rejects_bad_creds(client):
    r = await client.post("/admin/login", json={"username": "nope", "password": "nope"})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_endpoints_require_auth(client):
    r = await client.get("/admin/users")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_without_token_401(client):
    r = await client.get("/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_transactions_mine_without_token_401(client):
    r = await client.get("/transactions/mine")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_merchants_me_without_token_401(client):
    r = await client.get("/merchants/me")
    assert r.status_code == 401
