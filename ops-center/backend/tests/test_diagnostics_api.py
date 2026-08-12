"""Tests for ops-center 视频创作失败诊断上报与看板汇总。"""
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), "ops_diagnostics_test.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), "ops_diag_configs")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"

import models  # noqa: F401
from config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from database import engine, Base

    settings.catalog_api_key = os.environ.get("OPS_CATALOG_API_KEY", "catalog-test-key")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _client():
    from httpx import AsyncClient, ASGITransport
    from main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _admin_headers():
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {"sub": "admin", "username": "admin", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _daily(**over):
    base = {"diag_date": "2026-08-10", "client_id": "dev-1", "pipeline": "story2video-compose",
            "total_runs": 10, "failed_runs": 2, "success_runs": 7, "cancelled_runs": 1}
    base.update(over)
    return base


def _sample(**over):
    base = {
        "diag_date": "2026-08-10", "client_id": "dev-1", "run_id": "run-1", "pipeline": "story2video-compose",
        "status": "failed", "stage": "compose", "failure_type": "timeout", "severity": "blocker",
        "recoverability": "retryable", "cause_id": "provider_timeout", "duration_ms": 120000,
        "env": {"disk_free_bytes": 3000000000, "python_backend": True, "evil": "drop-me"},
    }
    base.update(over)
    return base


def _post(client, body, batch="b-1"):
    return client.post("/api/v1/diagnostics/ingest", json=body, headers={"X-Catalog-Key": "catalog-test-key"})


@pytest.mark.asyncio
async def test_ingest_auth_and_idempotent_accumulate():
    async with _client() as client:
        # 鉴权：无 Key / 错误 Key → 401
        assert (await client.post("/api/v1/diagnostics/ingest", json={})).status_code == 401
        assert (await client.post("/api/v1/diagnostics/ingest", json={}, headers={"X-Catalog-Key": "wrong"})).status_code == 401

        r = await _post(client, {"daily": [_daily()], "samples": [_sample()], "batch_id": "b-1"})
        assert r.status_code == 200, r.text
        assert r.json()["ingested"] == 1
        assert r.json()["samples_stored"] == 1

        # 同桶不同批次 → 累加
        r = await _post(client, {"daily": [_daily(total_runs=5, failed_runs=1, success_runs=4)], "batch_id": "b-2"})
        assert r.status_code == 200
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["runs"] == 15
        assert summary["totals"]["failed"] == 3

        # 同批次重复提交 → duplicate，计数不翻倍
        r = await _post(client, {"daily": [_daily(total_runs=5)], "batch_id": "b-2"})
        assert r.status_code == 200
        assert r.json()["duplicate"] is True
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["runs"] == 15


@pytest.mark.asyncio
async def test_duplicate_batch_returns_acked_max_id():
    async with _client() as client:
        r = await _post(client, {"daily": [_daily()], "batch_id": "dev-1:0:7"})
        assert r.status_code == 200
        # 同 batch_id 重试（新行加入导致 maxId 变化，但 batch 起点相同）→ duplicate 且回传 acked_max_id=7
        r = await _post(client, {"daily": [_daily(total_runs=5)], "batch_id": "dev-1:0:7"})
        assert r.status_code == 200
        body = r.json()
        assert body["duplicate"] is True
        assert body["acked_max_id"] == 7
        # 计数不翻倍
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["runs"] == 10


@pytest.mark.asyncio
async def test_sample_must_be_failed():
    async with _client() as client:
        r = await _post(client, {"samples": [_sample(run_id="ok-1", status="completed")], "batch_id": "st-1"})
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_sample_dedupe_and_env_whitelist():
    async with _client() as client:
        r = await _post(client, {"samples": [_sample()], "batch_id": "s-1"})
        assert r.json()["samples_stored"] == 1
        # 同 run_id 重复 → 不重复存储
        r = await _post(client, {"samples": [_sample()], "batch_id": "s-2"})
        assert r.json()["samples_stored"] == 0
        samples = (await client.get("/api/v1/diagnostics/samples?days=30", headers=_admin_headers())).json()
        assert samples["total"] == 1
        # env 白名单：evil 键被丢弃
        assert samples["items"][0]["env"] == {"disk_free_bytes": 3000000000, "python_backend": True}


@pytest.mark.asyncio
async def test_ingest_invalid_rejected():
    async with _client() as client:
        # 非法日期
        r = await _post(client, {"daily": [_daily(diag_date="2026-99-99")], "batch_id": "i-1"})
        assert r.status_code == 400
        # 未知 failure_type
        r = await _post(client, {"samples": [_sample(failure_type="bogus")], "batch_id": "i-2"})
        assert r.status_code == 400
        # 负数
        r = await _post(client, {"daily": [_daily(total_runs=-1)], "batch_id": "i-3"})
        assert r.status_code == 400
        # 非法输入不写入
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["runs"] == 0


@pytest.mark.asyncio
async def test_summary_alerts_and_dimensions():
    async with _client() as client:
        await _post(client, {"daily": [
            _daily(total_runs=10, failed_runs=8, success_runs=2, cancelled_runs=0, pipeline="story2video-compose"),
        ], "batch_id": "a-1"})
        await _post(client, {"samples": [
            _sample(run_id="r-1", stage="compose", cause_id="sidecar_unavailable"),
            _sample(run_id="r-2", stage="compose", failure_type="infrastructure", cause_id="sidecar_stale_instance"),
            _sample(run_id="r-3", stage="compose", cause_id="provider_timeout"),
        ], "batch_id": "a-2"})
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        # 失败率 80% → HIGH 告警
        assert summary["totals"]["failure_rate"] == 80.0
        levels = [a["level"] for a in summary["alerts"]]
        assert "HIGH" in levels
        # compose 占比 100% → MEDIUM；sidecar 占比 2/3 → MEDIUM
        assert "MEDIUM" in levels
        # 磁盘不足样本（3GB < 5GB）→ LOW
        assert "LOW" in levels
        assert summary["env"]["disk_low_count"] == 3
        assert summary["by_cause"][0]["cause_id"] == "sidecar_unavailable"
        assert summary["totals"]["affected_clients"] == 1


@pytest.mark.asyncio
async def test_summary_no_alert_when_below_threshold():
    async with _client() as client:
        await _post(client, {"daily": [_daily(total_runs=100, failed_runs=5, success_runs=95)], "batch_id": "n-1"})
        await _post(client, {"samples": [
            _sample(run_id="n-1", stage="generate_assets", cause_id="provider_timeout", env={"disk_free_bytes": 50 * 1024 ** 3}),
        ], "batch_id": "n-2"})
        summary = (await client.get("/api/v1/diagnostics/summary?days=30", headers=_admin_headers())).json()
        assert summary["totals"]["failure_rate"] == 5.0
        assert summary["alerts"] == []


@pytest.mark.asyncio
async def test_samples_filter_and_admin_auth():
    async with _client() as client:
        assert (await client.get("/api/v1/diagnostics/summary?days=30")).status_code == 401
        assert (await client.get("/api/v1/diagnostics/samples?days=30")).status_code == 401
        await _post(client, {"samples": [
            _sample(run_id="f-1", cause_id="provider_timeout"),
            _sample(run_id="f-2", cause_id="disk_full"),
        ], "batch_id": "f-1"})
        filtered = (await client.get("/api/v1/diagnostics/samples?days=30&cause_id=disk_full", headers=_admin_headers())).json()
        assert filtered["total"] == 1
        assert filtered["items"][0]["run_id"] == "f-2"


@pytest.mark.asyncio
async def test_sample_retention_cleanup():
    import datetime

    async with _client() as client:
        today = datetime.date.today()
        old_date = (today - datetime.timedelta(days=40)).isoformat()  # >30 天前
        recent_date = (today - datetime.timedelta(days=5)).isoformat()
        # 过期样本在 ingest 时即被滚动清理，不落库
        await _post(client, {"samples": [_sample(run_id="old-1", diag_date=old_date)], "batch_id": "ret-1"})
        samples = (await client.get("/api/v1/diagnostics/samples?days=90", headers=_admin_headers())).json()
        assert samples["total"] == 0
        # 近期样本保留，且后续 ingest 不误删
        await _post(client, {"samples": [_sample(run_id="new-1", diag_date=recent_date)], "batch_id": "ret-2"})
        samples = (await client.get("/api/v1/diagnostics/samples?days=90", headers=_admin_headers())).json()
        assert samples["total"] == 1
        assert samples["items"][0]["run_id"] == "new-1"
