"""Pipeline API 路由测试"""
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_list_pipelines():
    resp = client.get("/api/pipelines")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert isinstance(data["data"], list)
    assert len(data["data"]) > 0
    # Verify structure
    first = data["data"][0]
    assert "name" in first
    assert "description" in first


def test_pipeline_detail_found():
    resp = client.get("/api/pipelines/animated-explainer")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == 0
    assert data["data"]["name"] == "animated-explainer"


def test_pipeline_detail_not_found():
    resp = client.get("/api/pipelines/nonexistent-pipeline")
    assert resp.status_code == 404


def test_pipeline_detail_has_description():
    resp = client.get("/api/pipelines/talking-head")
    assert resp.status_code == 200
    data = resp.json()
    assert "description" in data["data"]
    assert len(data["data"]["description"]) > 0
