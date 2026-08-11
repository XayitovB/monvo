"""Token revocation (logout blacklist) testlari."""
import time

import pytest

from core import token_revocation
from core.security import create_access_token, decode_access_token


def test_new_token_has_jti():
    tok = create_access_token({"sub": 1})
    payload = decode_access_token(tok)
    assert payload.get("jti")  # bo'sh emas


@pytest.mark.asyncio
async def test_revoke_then_is_revoked():
    jti = "test-jti-abc"
    assert await token_revocation.is_revoked(jti) is False
    await token_revocation.revoke(jti, exp_ts=time.time() + 3600)
    assert await token_revocation.is_revoked(jti) is True


@pytest.mark.asyncio
async def test_none_jti_never_revoked():
    """jti yo'q eski token'lar bekor qilinmaydi (orqaga moslik)."""
    assert await token_revocation.is_revoked(None) is False
    await token_revocation.revoke(None)  # no-op, xato bermasligi kerak


@pytest.mark.asyncio
async def test_unknown_jti_not_revoked():
    assert await token_revocation.is_revoked("never-revoked-xyz") is False
