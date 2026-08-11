"""core/geocode.py — manzildan koordinata testlari (tarmoqsiz, _fetch mock)."""
import pytest

import core.geocode as geocode


@pytest.mark.asyncio
async def test_empty_address_returns_none():
    assert await geocode.geocode_address("") is None
    assert await geocode.geocode_address("   ") is None


@pytest.mark.asyncio
async def test_successful_geocode(monkeypatch):
    async def fake_fetch(params, timeout):
        return [{"lat": "41.311081", "lon": "69.240562", "display_name": "Tashkent"}]
    monkeypatch.setattr(geocode, "_fetch", fake_fetch)
    coords = await geocode.geocode_address("Toshkent, Amir Temur 1")
    assert coords == (41.311081, 69.240562)


@pytest.mark.asyncio
async def test_no_result_returns_none(monkeypatch):
    async def fake_fetch(params, timeout):
        return []
    monkeypatch.setattr(geocode, "_fetch", fake_fetch)
    assert await geocode.geocode_address("nonexistent place xyz") is None


@pytest.mark.asyncio
async def test_malformed_item_returns_none(monkeypatch):
    async def fake_fetch(params, timeout):
        return [{"display_name": "no coords here"}]
    monkeypatch.setattr(geocode, "_fetch", fake_fetch)
    assert await geocode.geocode_address("somewhere") is None


@pytest.mark.asyncio
async def test_network_error_is_swallowed(monkeypatch):
    async def boom(params, timeout):
        raise RuntimeError("network down")
    monkeypatch.setattr(geocode, "_fetch", boom)
    # Geokodlash hech qachon saqlashni buzmaydi → None
    assert await geocode.geocode_address("Toshkent") is None
