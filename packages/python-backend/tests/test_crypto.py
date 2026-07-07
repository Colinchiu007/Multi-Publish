"""Tests for CredentialCrypto — 凭证加密模块."""

import pytest

from multi_publish.crypto import CredentialCrypto, get_crypto


class TestCredentialCrypto:
    def test_init_random_key(self):
        c = CredentialCrypto()
        assert c._salt is None
        assert c._fernet is not None

    def test_init_with_password(self):
        c = CredentialCrypto(master_password="my_secret")
        assert c._salt is not None

    def test_encrypt_decrypt_roundtrip(self):
        c = CredentialCrypto()
        plain = "hello world 123"
        encrypted = c.encrypt(plain)
        assert encrypted != plain
        decrypted = c.decrypt(encrypted)
        assert decrypted == plain

    def test_encrypt_dict_roundtrip(self):
        c = CredentialCrypto()
        data = {"username": "user1", "password": "p@ss123", "keep": 42}
        enc = c.encrypt_dict(data)
        assert enc["username"].startswith("enc:")
        assert enc["keep"] == 42
        dec = c.decrypt_dict(enc)
        assert dec["username"] == "user1"
        assert dec["password"] == "p@ss123"
        assert dec["keep"] == 42

    def test_encrypt_dict_preserves_existing_enc(self):
        c = CredentialCrypto()
        data = {"token": "enc:already_encrypted"}
        enc = c.encrypt_dict(data)
        assert enc["token"] == "enc:already_encrypted"

    def test_decrypt_invalid_raises(self):
        c = CredentialCrypto()
        with pytest.raises(ValueError):
            c.decrypt("invalid_base64!!")

    def test_get_crypto_singleton(self):
        c1 = get_crypto()
        c2 = get_crypto()
        assert c1 is c2

    def test_different_keys_fail(self):
        c1 = CredentialCrypto(master_password="key1")
        c2 = CredentialCrypto(master_password="key2")
        encrypted = c1.encrypt("secret")
        with pytest.raises(ValueError):
            c2.decrypt(encrypted)
