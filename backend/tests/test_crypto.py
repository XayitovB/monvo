"""core/crypto.py — shifrlash yordamchisi testlari."""
import pytest
from cryptography.fernet import Fernet

import core.crypto as crypto


@pytest.fixture
def with_key(monkeypatch):
    """Vaqtincha haqiqiy Fernet kalitini o'rnatadi."""
    f = Fernet(Fernet.generate_key())
    monkeypatch.setattr(crypto, "_fernet", f)
    return f


def test_passthrough_without_key(monkeypatch):
    """Kalit yo'q bo'lsa — shifrlanmaydi (passthrough)."""
    monkeypatch.setattr(crypto, "_fernet", None)
    assert crypto.encrypt_str("secret") == "secret"
    assert crypto.decrypt_str("secret") == "secret"
    assert crypto.encryption_enabled() is False


def test_string_roundtrip(with_key):
    enc = crypto.encrypt_str("api_secret_123")
    assert enc != "api_secret_123"  # haqiqatan shifrlangan
    assert crypto.decrypt_str(enc) == "api_secret_123"


def test_decrypt_legacy_plaintext_passthrough(with_key):
    """Eski (shifrlanmagan) qiymat ochib bo'lmasa — o'zini qaytaradi."""
    assert crypto.decrypt_str("legacy-plaintext") == "legacy-plaintext"


def test_encrypted_json_typedecorator_roundtrip(with_key):
    col = crypto.EncryptedJSON()
    creds = {"api_login": "shop", "api_secret": "xyz", "shop_id": 42}
    bound = col.process_bind_param(creds, None)
    # Shifrlangan: marker bor, asl qiymat ko'rinmaydi
    assert crypto._ENC_MARKER in bound
    assert "xyz" not in str(bound[crypto._ENC_MARKER])
    # Qaytarish: asl dict
    assert col.process_result_value(bound, None) == creds


def test_encrypted_json_reads_legacy_plaintext(with_key):
    """Bazadagi eski oddiy dict (marker'siz) o'zgarmasdan o'qiladi."""
    col = crypto.EncryptedJSON()
    legacy = {"api_login": "old", "api_secret": "plain"}
    assert col.process_result_value(legacy, None) == legacy


def test_encrypted_json_passthrough_without_key(monkeypatch):
    monkeypatch.setattr(crypto, "_fernet", None)
    col = crypto.EncryptedJSON()
    creds = {"k": "v"}
    bound = col.process_bind_param(creds, None)
    assert bound == creds  # shifrlanmagan
    assert col.process_result_value(bound, None) == creds
