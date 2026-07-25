"""平台账号凭证目录与 Logto owner 生命周期测试。"""

from fastapi.testclient import TestClient

import server


class StubVerifier:
    def __init__(self, subject: str):
        self.subject = subject

    async def verify(self, _token: str):
        return {"subject": self.subject, "scopes": ["account:manage"]}


def _client(monkeypatch, tmp_path, verifier: StubVerifier) -> TestClient:
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    return TestClient(server.app)


def _headers(token: str = "token-a") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_load_accounts_accepts_utf8_bom(monkeypatch, tmp_path):
    accounts_file = tmp_path / "accounts.json"
    accounts_file.write_bytes(b'\xef\xbb\xbf{"account-a": {"id": "account-a"}}')
    monkeypatch.setattr(server, "ACCOUNTS_FILE", accounts_file)

    assert server._load_accounts() == {"account-a": {"id": "account-a"}}


def test_create_delete_metadata_account_never_creates_credential_files(monkeypatch, tmp_path):
    verifier = StubVerifier("sub-a")
    client = _client(monkeypatch, tmp_path, verifier)
    created = client.post(
        "/api/accounts",
        headers=_headers(),
        json={
            "platform": "douyin",
            "name": "账号 A",
        },
    )

    assert created.status_code == 200
    account_id = created.json()["data"]["id"]
    account_dir = tmp_path / "accounts" / "douyin" / account_id
    assert not account_dir.exists()
    stored = server._load_accounts()[account_id]
    assert stored["owner_subject"] == "sub-a"
    assert "cookies" not in stored
    assert "auth_data" not in stored

    legacy_auth_file = tmp_path / "auth_douyin.json"
    legacy_cookie_file = tmp_path / "cookies_douyin.json"
    legacy_auth_file.write_text('{"token": "legacy"}', encoding="utf-8")
    legacy_cookie_file.write_text('[{"name": "sid"}]', encoding="utf-8")

    deleted = client.delete(f"/api/accounts/{account_id}", headers=_headers())

    assert deleted.status_code == 200
    assert not account_dir.exists()
    assert account_id not in server._load_accounts()
    assert not legacy_auth_file.exists()
    assert not legacy_cookie_file.exists()


def test_cookie_endpoint_is_disabled_before_owner_lookup_and_metadata_remains_isolated(monkeypatch, tmp_path):
    verifier = StubVerifier("sub-a")
    client = _client(monkeypatch, tmp_path, verifier)
    created = client.post(
        "/api/accounts",
        headers=_headers(),
        json={
            "platform": "douyin",
            "name": "账号 A",
        },
    )
    account_id = created.json()["data"]["id"]

    verifier.subject = "sub-b"
    update = client.put(
        f"/api/accounts/{account_id}/cookies",
        headers=_headers("token-b"),
        json={"cookies": []},
    )
    delete = client.delete(f"/api/accounts/{account_id}", headers=_headers("token-b"))

    assert update.status_code == 410
    assert update.json()["detail"] == "CREDENTIAL_ENDPOINT_DISABLED"
    assert delete.status_code == 404
    stored = server._load_accounts()[account_id]
    assert stored["owner_subject"] == "sub-a"
    assert "cookies" not in stored
    assert "auth_data" not in stored
