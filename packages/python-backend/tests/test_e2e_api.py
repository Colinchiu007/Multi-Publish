"""E2E API Tests -- FastAPI backend integration tests."""

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


class TestHealth:
    def test_health_returns_ok(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


class TestPlatforms:
    def test_list_platforms(self):
        resp = client.get("/api/platforms")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        platforms = body["data"]
        assert isinstance(platforms, list)
        assert len(platforms) > 0

    def test_platform_fields(self):
        resp = client.get("/api/platforms")
        platforms = resp.json()["data"]
        for p in platforms:
            assert "key" in p
            assert "name" in p

    def test_major_platforms_present(self):
        resp = client.get("/api/platforms")
        names = [p["key"] for p in resp.json()["data"]]
        major_keys = ['wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu']
        for expected in major_keys:
            assert expected in names


class TestPipelines:
    def test_list_pipelines(self):
        resp = client.get("/api/pipelines")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        pipelines = body["data"]
        assert isinstance(pipelines, list)
        assert len(pipelines) > 0

    def test_pipeline_has_fields(self):
        resp = client.get("/api/pipelines")
        pipelines = resp.json()["data"]
        for p in pipelines:
            assert "name" in p
            assert "description" in p


class TestAccounts:
    def test_list_empty(self):
        resp = client.get("/api/accounts")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    def test_create_missing_fields(self):
        resp = client.post("/api/accounts", json={})
        assert resp.status_code == 422

    def test_create_invalid_platform(self):
        resp = client.post("/api/accounts", json={"platform": "nonexistent", "name": "test"})
        assert resp.status_code in (400, 422)


class TestErrors:
    def test_404_unknown_route(self):
        resp = client.get("/api/nonexistent")
        assert resp.status_code == 404

    def test_account_not_found(self):
        resp = client.get("/api/accounts/nonexistent-id")
        assert resp.status_code in (404, 500)
