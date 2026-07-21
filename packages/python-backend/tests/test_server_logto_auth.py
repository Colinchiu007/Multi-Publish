"""FastAPI 服务的 Logto 鉴权接线测试。"""

import json

import pytest
from fastapi.testclient import TestClient

import server


class StubVerifier:
    def __init__(self, scopes, subject="sub-1"):
        self.scopes = scopes
        self.subject = subject
        self.tokens = []

    async def verify(self, token):
        self.tokens.append(token)
        return {"subject": self.subject, "scopes": list(self.scopes)}


def test_health_is_public_but_business_route_requires_identity(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", StubVerifier(["publish:read"]), raising=False)

    client = TestClient(server.app)
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/platforms").status_code == 401


def test_business_route_checks_logto_scope(monkeypatch):
    verifier = StubVerifier(["publish:read"])
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier, raising=False)

    response = TestClient(server.app).get("/api/platforms", headers={"Authorization": "Bearer token-1"})

    assert response.status_code == 200
    assert verifier.tokens == ["token-1"]


def test_business_route_rejects_missing_scope(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", StubVerifier([]), raising=False)

    response = TestClient(server.app).get("/api/platforms", headers={"Authorization": "Bearer token-1"})

    assert response.status_code == 403
    assert response.json()["detail"] == "AUTH_SCOPE_MISSING"


def test_gray_release_allows_missing_identity_when_not_required(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False, raising=False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None, raising=False)

    assert TestClient(server.app).get("/api/platforms").status_code == 200


def test_required_flag_fails_closed_even_if_enabled_flag_is_off(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", False, raising=False)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True, raising=False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None, raising=False)

    assert TestClient(server.app).get("/api/platforms").status_code == 503


@pytest.mark.parametrize("value", ["treu", "1foo", ""])
def test_identity_flag_rejects_invalid_boolean_configuration(monkeypatch, value):
    monkeypatch.setenv("IDENTITY_AUTH_REQUIRED", value)

    with pytest.raises(ValueError, match="IDENTITY_AUTH_REQUIRED"):
        server._env_bool("IDENTITY_AUTH_REQUIRED")


def test_accounts_are_isolated_by_authenticated_subject(monkeypatch, tmp_path):
    verifier = StubVerifier(["account:manage"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    client = TestClient(server.app)

    created = client.post(
        "/api/accounts",
        headers={"Authorization": "Bearer token-a"},
        json={"platform": "douyin", "name": "A 的账号"},
    )
    assert created.status_code == 200
    account_id = created.json()["data"]["id"]

    verifier.subject = "sub-b"
    assert client.get("/api/accounts", headers={"Authorization": "Bearer token-b"}).json()["data"] == []
    assert client.get(
        f"/api/accounts/{account_id}", headers={"Authorization": "Bearer token-b"}
    ).status_code == 404


def test_login_uses_same_owned_account_id_for_rpa_session(monkeypatch, tmp_path):
    calls = []

    async def login_to_platform(platform, account_id=None):
        calls.append((platform.value, account_id))
        return True

    verifier = StubVerifier(["account:manage"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    monkeypatch.setattr(server.publisher_mgr, "is_supported", lambda _platform: True)
    monkeypatch.setattr(server.publisher_mgr, "login_to_platform", login_to_platform)

    response = TestClient(server.app).post(
        "/api/login",
        headers={"Authorization": "Bearer token-a"},
        json={"platform": "douyin"},
    )

    assert response.status_code == 200
    account_id = response.json()["data"]["account_id"]
    assert calls == [("douyin", account_id)]
    assert server._load_accounts()[account_id]["owner_subject"] == "sub-a"


def test_publish_task_records_owner_subject(monkeypatch):
    class Result:
        success = True
        url = "https://example.com/published"
        error = None
        duration = 1

    async def publish_to_platform(**_kwargs):
        return Result()

    verifier = StubVerifier(["publish:submit"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "_publish_tasks", {})
    monkeypatch.setattr(server, "_publish_progress", {})
    monkeypatch.setattr(
        server,
        "_load_accounts",
        lambda: {"account-a": {"id": "account-a", "platform": "douyin", "owner_subject": "sub-a"}},
    )
    monkeypatch.setattr(server.publisher_mgr, "is_supported", lambda _platform: True)
    monkeypatch.setattr(server.publisher_mgr, "publish_to_platform", publish_to_platform)

    response = TestClient(server.app).post(
        "/api/publish",
        headers={"Authorization": "Bearer token-a"},
        json={"title": "测试", "platform": "douyin", "account_id": "account-a"},
    )

    assert response.status_code == 200
    task_id = response.json()["data"]["task_id"]
    assert server._publish_tasks[task_id]["owner_subject"] == "sub-a"


def test_publish_rejects_account_owned_by_another_subject(monkeypatch):
    verifier = StubVerifier(["publish:submit"], subject="sub-b")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(
        server,
        "_load_accounts",
        lambda: {"account-a": {"id": "account-a", "platform": "douyin", "owner_subject": "sub-a"}},
    )

    response = TestClient(server.app).post(
        "/api/publish",
        headers={"Authorization": "Bearer token-b"},
        json={"title": "测试", "platform": "douyin", "account_id": "account-a"},
    )

    assert response.status_code == 404


def test_authenticated_publish_requires_owned_account(monkeypatch):
    verifier = StubVerifier(["publish:submit"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)

    response = TestClient(server.app).post(
        "/api/publish",
        headers={"Authorization": "Bearer token-a"},
        json={"title": "测试", "platform": "douyin"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "ACCOUNT_REQUIRED"


def test_publish_status_and_progress_hide_other_subjects(monkeypatch):
    verifier = StubVerifier(["publish:read"], subject="sub-b")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(
        server,
        "_publish_tasks",
        {"task-1": {"status": "done", "platform": "douyin", "owner_subject": "sub-a"}},
    )
    monkeypatch.setattr(
        server,
        "_publish_progress",
        {"task-1": {"task_id": "task-1", "phase": "done", "percent": 100, "owner_subject": "sub-a"}},
    )
    client = TestClient(server.app)

    assert client.get(
        "/api/publish/task-1/status", headers={"Authorization": "Bearer token-b"}
    ).status_code == 404
    assert client.get(
        "/api/publish/task-1/progress", headers={"Authorization": "Bearer token-b"}
    ).status_code == 404

    verifier.subject = "sub-a"
    status = client.get("/api/publish/task-1/status", headers={"Authorization": "Bearer token-a"})
    progress = client.get("/api/publish/task-1/progress", headers={"Authorization": "Bearer token-a"})
    assert status.status_code == 200
    assert progress.status_code == 200
    assert "owner_subject" not in status.json()["data"]
    assert "owner_subject" not in progress.json()["data"]


def test_gray_release_anonymous_only_accesses_legacy_accounts(monkeypatch, tmp_path):
    accounts_file = tmp_path / "accounts.json"
    accounts_file.write_text(
        json.dumps(
            {
                "owned": {
                    "id": "owned",
                    "platform": "douyin",
                    "name": "已归属账号",
                    "cookies": [{"name": "session", "value": "secret"}],
                    "owner_subject": "sub-a",
                },
                "legacy": {
                    "id": "legacy",
                    "platform": "douyin",
                    "name": "旧版账号",
                    "cookies": [],
                    "owner_subject": None,
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", accounts_file)
    client = TestClient(server.app)

    listed_ids = {item["id"] for item in client.get("/api/accounts").json()["data"]}
    assert listed_ids == {"legacy"}
    assert client.get("/api/accounts/owned/cookies").status_code == 401
    assert client.delete("/api/accounts/owned").status_code == 401
    assert "owned" in server._load_accounts()
    assert client.get("/api/accounts/legacy").status_code == 200


def test_gray_release_anonymous_cannot_read_owned_publish_tasks(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None)
    monkeypatch.setattr(
        server,
        "_publish_tasks",
        {
            "owned": {"status": "done", "owner_subject": "sub-a"},
            "legacy": {"status": "done", "owner_subject": None},
        },
    )
    monkeypatch.setattr(
        server,
        "_publish_progress",
        {
            "owned": {"task_id": "owned", "percent": 100, "owner_subject": "sub-a"},
            "legacy": {"task_id": "legacy", "percent": 100, "owner_subject": None},
        },
    )
    client = TestClient(server.app)

    assert client.get("/api/publish/owned/status").status_code == 404
    assert client.get("/api/publish/owned/progress").status_code == 404
    assert client.get("/api/publish/legacy/status").status_code == 200


def test_gray_release_anonymous_cannot_read_or_mutate_legacy_account_cookies(monkeypatch, tmp_path):
    accounts_file = tmp_path / "accounts.json"
    accounts_file.write_text(
        json.dumps({
            "legacy": {
                "id": "legacy",
                "platform": "douyin",
                "cookies": [{"name": "sid", "value": "secret"}],
                "owner_subject": None,
            },
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", accounts_file)
    client = TestClient(server.app)

    assert client.get("/api/accounts/legacy/cookies").status_code == 401
    assert client.put(
        "/api/accounts/legacy/cookies",
        json={"platform": "douyin", "name": "legacy", "cookies": []},
    ).status_code == 401
    assert client.delete("/api/accounts/legacy").status_code == 401


def test_gray_release_anonymous_cannot_publish_with_account_id(monkeypatch):
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", False)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", None)
    monkeypatch.setattr(
        server,
        "_load_accounts",
        lambda: {"legacy": {"id": "legacy", "platform": "douyin", "owner_subject": None}},
    )
    monkeypatch.setattr(server.publisher_mgr, "is_supported", lambda _platform: True)

    response = TestClient(server.app).post(
        "/api/publish",
        json={"title": "测试", "platform": "douyin", "account_id": "legacy"},
    )

    assert response.status_code == 401


def test_publish_exception_does_not_expose_internal_error(monkeypatch):
    verifier = StubVerifier(["publish:submit"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(
        server,
        "_load_accounts",
        lambda: {"account-a": {"id": "account-a", "platform": "douyin", "owner_subject": "sub-a"}},
    )
    monkeypatch.setattr(server.publisher_mgr, "is_supported", lambda _platform: True)

    async def raise_internal(**_kwargs):
        raise RuntimeError("Playwright cookie path C:/secret/session.json")

    monkeypatch.setattr(server.publisher_mgr, "publish_to_platform", raise_internal)
    response = TestClient(server.app).post(
        "/api/publish",
        headers={"Authorization": "Bearer token-a"},
        json={"title": "测试", "platform": "douyin", "account_id": "account-a"},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "PUBLISH_FAILED"
    assert "secret" not in response.text


def test_login_reads_auth_data_from_generated_account_directory(monkeypatch, tmp_path):
    calls = []

    async def login_to_platform(platform, account_id=None):
        calls.append((platform.value, account_id))
        account_dir = tmp_path / "accounts" / platform.value / account_id
        account_dir.mkdir(parents=True)
        (account_dir / "auth.json").write_text(
            json.dumps({"cookies": [{"name": "sid", "value": "ok"}], "local_storage": {"token": "ok"}}),
            encoding="utf-8",
        )
        return True

    verifier = StubVerifier(["account:manage"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    monkeypatch.setattr(server.publisher_mgr, "is_supported", lambda _platform: True)
    monkeypatch.setattr(server.publisher_mgr, "login_to_platform", login_to_platform)

    response = TestClient(server.app).post(
        "/api/login",
        headers={"Authorization": "Bearer token-a"},
        json={"platform": "douyin"},
    )

    assert response.status_code == 200
    account_id = response.json()["data"]["account_id"]
    assert calls == [("douyin", account_id)]
    assert response.json()["data"]["cookie_count"] == 1
    assert server._load_accounts()[account_id]["auth_data"]["local_storage"] == {"token": "ok"}


def test_auth_status_requires_owned_account_and_passes_account_id(monkeypatch, tmp_path):
    calls = []

    async def get_auth_status(platform, account_id=None):
        calls.append((platform.value, account_id))
        return True

    verifier = StubVerifier(["account:manage"], subject="sub-a")
    monkeypatch.setattr(server, "IDENTITY_AUTH_ENABLED", True)
    monkeypatch.setattr(server, "IDENTITY_AUTH_REQUIRED", True)
    monkeypatch.setattr(server, "IDENTITY_VERIFIER", verifier)
    monkeypatch.setattr(server, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    monkeypatch.setattr(
        server,
        "_load_accounts",
        lambda: {
            "account-a": {"id": "account-a", "platform": "douyin", "owner_subject": "sub-a"},
            "account-b": {"id": "account-b", "platform": "douyin", "owner_subject": "sub-b"},
        },
    )
    monkeypatch.setattr(server.publisher_mgr, "get_auth_status", get_auth_status)
    client = TestClient(server.app)

    missing = client.get("/api/auth-status/douyin", headers={"Authorization": "Bearer token-a"})
    forbidden = client.get(
        "/api/auth-status/douyin?account_id=account-b",
        headers={"Authorization": "Bearer token-a"},
    )
    allowed = client.get(
        "/api/auth-status/douyin?account_id=account-a",
        headers={"Authorization": "Bearer token-a"},
    )

    assert missing.status_code == 422
    assert forbidden.status_code == 404
    assert allowed.status_code == 200
    assert calls == [("douyin", "account-a")]
