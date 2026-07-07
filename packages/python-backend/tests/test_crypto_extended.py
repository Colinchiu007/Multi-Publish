"""Tests for crypto.py — credential encryption/decryption."""

from __future__ import annotations

import pytest

from multi_publish.crypto import CredentialCrypto, get_crypto


class TestCredentialCrypto:
    """CredentialCrypto roundtrip tests."""

    def test_encrypt_decrypt_roundtrip(self):
        cc = CredentialCrypto("test-password")
        original = "my-secret-value"
        encrypted = cc.encrypt(original)
        assert encrypted != original
        assert cc.decrypt(encrypted) == original

    def test_encrypt_empty_string(self):
        cc = CredentialCrypto("test-password")
        encrypted = cc.encrypt("")
        decrypted = cc.decrypt(encrypted)
        assert decrypted == ""

    def test_encrypt_unicode(self):
        cc = CredentialCrypto("test-password")
        original = "中文密码🔑"
        encrypted = cc.encrypt(original)
        assert cc.decrypt(encrypted) == original

    def test_encrypt_long_string(self):
        cc = CredentialCrypto("test-password")
        original = "x" * 10000
        encrypted = cc.encrypt(original)
        assert cc.decrypt(encrypted) == original

    def test_random_key_roundtrip(self):
        """Dev mode: random key (no password)."""
        cc = CredentialCrypto()  # no password
        original = "dev-secret"
        encrypted = cc.encrypt(original)
        assert cc.decrypt(encrypted) == original

    def test_different_passwords_produce_different_ciphertexts(self):
        cc1 = CredentialCrypto("password-1")
        cc2 = CredentialCrypto("password-2")
        ct1 = cc1.encrypt("same-value")
        ct2 = cc2.encrypt("same-value")
        assert ct1 != ct2

    def test_same_input_produces_different_ciphertexts(self):
        """Fernet includes random IV, so same plaintext -> different ciphertext."""
        cc = CredentialCrypto("test-password")
        ct1 = cc.encrypt("same-value")
        ct2 = cc.encrypt("same-value")
        assert ct1 != ct2

    def test_decrypt_invalid_data_raises(self):
        cc = CredentialCrypto("test-password")
        with pytest.raises(ValueError):
            cc.decrypt("invalid-base64!!")

    def test_decrypt_wrong_key_raises(self):
        cc1 = CredentialCrypto("password-1")
        cc2 = CredentialCrypto("password-2")
        encrypted = cc1.encrypt("secret")
        with pytest.raises(ValueError):
            cc2.decrypt(encrypted)


class TestEncryptDecryptDict:
    """encrypt_dict/decrypt_dict with enc: prefix."""

    def test_encrypt_decrypt_dict_roundtrip(self):
        cc = CredentialCrypto("test-password")
        data = {"username": "user123", "password": "pass456"}
        encrypted = cc.encrypt_dict(data)
        assert encrypted["username"].startswith("enc:")
        assert encrypted["password"].startswith("enc:")
        decrypted = cc.decrypt_dict(encrypted)
        assert decrypted == data

    def test_nested_dict(self):
        cc = CredentialCrypto("test-password")
        data = {"account": {"user": "u", "pass": "p"}}
        encrypted = cc.encrypt_dict(data)
        assert encrypted["account"]["user"].startswith("enc:")
        decrypted = cc.decrypt_dict(encrypted)
        assert decrypted == data

    def test_skip_already_encrypted(self):
        """Fields with enc: prefix are kept as-is."""
        cc = CredentialCrypto("test-password")
        data = {"already_enc": "enc:existing-ciphertext", "plain": "value"}
        encrypted = cc.encrypt_dict(data)
        assert encrypted["already_enc"] == "enc:existing-ciphertext"

    def test_non_string_values_preserved(self):
        cc = CredentialCrypto("test-password")
        data = {"str": "value", "int": 42, "bool": True, "none": None}
        encrypted = cc.encrypt_dict(data)
        assert encrypted["int"] == 42
        assert encrypted["bool"] is True
        assert encrypted["none"] is None
        decrypted = cc.decrypt_dict(encrypted)
        assert decrypted == data

    def test_decrypt_dict_strips_enc_prefix(self):
        cc = CredentialCrypto("test-password")
        data = {"key": "plain-value"}
        encrypted = cc.encrypt_dict(data)
        inner = encrypted["key"][4:]  # after "enc:"
        decrypted = cc.decrypt(inner)
        assert decrypted == "plain-value"


class TestGetCrypto:
    """get_crypto() singleton."""

    def test_singleton_returns_same_instance(self):
        c1 = get_crypto("test")
        c2 = get_crypto("test")
        assert c1 is c2

    def test_singleton_with_different_password_ignored(self):
        """First call sets the key, subsequent calls ignore password."""
        c1 = get_crypto("password-1")
        c2 = get_crypto("password-2")
        assert c1 is c2
