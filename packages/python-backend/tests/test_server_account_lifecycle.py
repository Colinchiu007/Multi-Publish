"""平台账号凭证目录与 Logto owner 生命周期测试。"""

import json

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


def test_create_update_delete_account_keeps_directory_in_sync(monkeypatch, tmp_path):
    verifier = StubVerifier("sub-a")
    client = _client(monkeypatch, tmp_path, verifier)
    created = client.post(
        "/api/accounts",
        headers=_headers(),
        json={
            "platform": "douyin",
            "name": "账号 A",
            "cookies": [{"name": "sid", "value": "old"}],
            "auth_data": {
                "cookies": [{"name": "sid", "value": "old"}],
                "local_storage": {"token": "kept"},
            },
        },
    )

    assert created.status_code == 200
    account_id = created.json()["data"]["id"]
    account_dir = tmp_path / "accounts" / "douyin" / account_id
    assert json.loads((account_dir / "cookies.json").read_text(encoding="utf-8")) == [
        {"name": "sid", "value": "old"}
    ]
    assert json.loads((account_dir / "auth.json").read_text(encoding="utf-8"))["local_storage"] == {
        "token": "kept"
    }
    assert (account_dir / "browser_data").is_dir()

    updated = client.put(
        f"/api/accounts/{account_id}/cookies",
        headers=_headers(),
        json={
            "platform": "douyin",
            "name": "账号 A",
            "cookies": [{"name": "sid", "value": "new"}],
        },
    )

    assert updated.status_code == 200
    assert json.loads((account_dir / "cookies.json").read_text(encoding="utf-8"))[0]["value"] == "new"
    auth_data = json.loads((account_dir / "auth.json").read_text(encoding="utf-8"))
    assert auth_data["cookies"][0]["value"] == "new"
    assert auth_data["local_storage"] == {"token": "kept"}

    deleted = client.delete(f"/api/accounts/{account_id}", headers=_headers())

    assert deleted.status_code == 200
    assert not account_dir.exists()
    assert account_id not in server._load_accounts()


def test_other_owner_cannot_update_or_delete_account_files(monkeypatch, tmp_path):
    verifier = StubVerifier("sub-a")
    client = _client(monkeypatch, tmp_path, verifier)
    created = client.post(
        "/api/accounts",
        headers=_headers(),
        json={
            "platform": "douyin",
            "name": "账号 A",
            "cookies": [{"name": "sid", "value": "owner-a"}],
        },
    )
    account_id = created.json()["data"]["id"]
    cookie_file = tmp_path / "accounts" / "douyin" / account_id / "cookies.json"
    original = cookie_file.read_text(encoding="utf-8")

    verifier.subject = "sub-b"
    update = client.put(
        f"/api/accounts/{account_id}/cookies",
        headers=_headers("token-b"),
        json={
            "platform": "douyin",
            "name": "账号 B",
            "cookies": [{"name": "sid", "value": "owner-b"}],
        },
    )
    delete = client.delete(f"/api/accounts/{account_id}", headers=_headers("token-b"))

    assert update.status_code == 404
    assert delete.status_code == 404
    assert cookie_file.read_text(encoding="utf-8") == original
    assert account_id in server._load_accounts()
