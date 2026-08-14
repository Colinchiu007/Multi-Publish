"""PromptEval 双路对比（engine 变体）测试：引擎客户端/双路派生/失败语义/状态机/聚合/探测/迁移。"""
import asyncio
import json
import os
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_pe_dual_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pe_dual_cfg_{_RUN_ID}")
os.environ["OPS_PROMPT_EVAL_MEDIA_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pe_dual_media_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"
os.environ["OPS_PROMPT_EVAL_VISION_API_KEY"] = "vision-test-key"
os.environ["OPS_PROMPT_EVAL_LLM_BASE_URL"] = "https://x/v1"
os.environ["OPS_PROMPT_EVAL_LLM_MODEL"] = "MiniMax-M2.7"
os.environ["OPS_PROMPT_EVAL_LLM_API_KEY"] = "llm-test-key"

import sqlalchemy as sa
import models  # noqa: F401
from config import settings  # noqa: E402
from services import prompt_eval_service as svc  # noqa: E402
from services import prompt_eval_engine_client as engine_client  # noqa: E402
from services import prompt_eval_generation_service as generation  # noqa: E402
from services import prompt_eval_evaluation_service as evaluation  # noqa: E402
from services import prompt_eval_translation_service as translation  # noqa: E402
from services.prompt_eval_migration import ensure_prompt_eval_dual_columns  # noqa: E402


# ─── 本机临时 HTTP 服务（真网络栈，覆盖 200/5xx/超时/非法 JSON） ───

class _FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, raw=False):
        data = body if raw else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @property
    def _engine(self):
        return self.server.server_ref

    def do_POST(self):
        eng = self._engine
        if eng.optimize_sleep:
            time.sleep(eng.optimize_sleep)
        if eng.optimize_raw is not None:
            self._send(200, eng.optimize_raw, raw=True)
            return
        if eng.optimize_responses:
            resp = eng.optimize_responses.pop(0)
            if isinstance(resp, int):
                self._send(resp, {"error": "boom"})
                return
            self._send(200, resp)
            return
        self._send(200, {"optimized_prompt": "写实风格，金色阳光下的老妇人，细节丰富", "model_used": "test-model", "tokens_used": 88})

    def do_GET(self):
        if self.path == "/health":
            eng = self._engine
            if eng.health_sleep:
                time.sleep(eng.health_sleep)
            if eng.health_status != 200:
                self._send(eng.health_status, {"status": "error"})
                return
            self._send(200, {"status": "ok"})
            return
        self._send(404, {"error": "not found"})


class FakeEngineServer:
    """可编程假引擎：响应序列/延迟/非法体可控。"""

    def __init__(self):
        self.optimize_responses = []
        self.optimize_raw = None
        self.optimize_sleep = 0
        self.health_status = 200
        self.health_sleep = 0
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _FakeHandler)
        self.httpd.server_ref = self
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture()
def fake_engine():
    server = FakeEngineServer()
    yield server
    server.close()


# ─── 1.1 引擎客户端 ───

@pytest.mark.asyncio
async def test_optimize_ok(fake_engine):
    data = await engine_client.optimize(fake_engine.base_url, "一个老妇人在做饭")
    assert data["optimized_prompt"]
    assert data["model_used"] == "test-model"


@pytest.mark.asyncio
async def test_optimize_5xx_retry_then_success(fake_engine):
    fake_engine.optimize_responses = [500, {"optimized_prompt": "重试成功", "tokens_used": 1}]
    data = await engine_client.optimize(fake_engine.base_url, "prompt")
    assert data["optimized_prompt"] == "重试成功"


@pytest.mark.asyncio
async def test_optimize_5xx_final_fails(fake_engine):
    fake_engine.optimize_responses = [500, 503]
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "HTTP 503" in str(ei.value)
    assert ei.value.stage == "engine_optimize"


@pytest.mark.asyncio
async def test_optimize_timeout_fails(monkeypatch, fake_engine):
    monkeypatch.setattr(engine_client, "OPTIMIZE_TIMEOUT_SECONDS", 1)
    fake_engine.optimize_sleep = 2
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "不可达" in str(ei.value) or "Timeout" in str(ei.value)


@pytest.mark.asyncio
async def test_optimize_invalid_json_fails(fake_engine):
    fake_engine.optimize_raw = b"<html>not json</html>"
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "非法 JSON" in str(ei.value)


@pytest.mark.asyncio
async def test_optimize_empty_prompt_fail_closed(fake_engine):
    fake_engine.optimize_responses = [{"optimized_prompt": "", "tokens_used": 1}]
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "optimized_prompt" in str(ei.value)


@pytest.mark.asyncio
async def test_optimize_non_string_prompt_fail_closed(fake_engine):
    fake_engine.optimize_responses = [{"optimized_prompt": 123}]
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "optimized_prompt" in str(ei.value)


@pytest.mark.asyncio
async def test_optimize_engine_internal_error_fail_closed(fake_engine):
    # 引擎内部失败回退原 prompt 并带 error 字段：不得静默降级
    fake_engine.optimize_responses = [{"optimized_prompt": "原样回退", "error": "llm provider failed"}]
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.optimize(fake_engine.base_url, "prompt")
    assert "内部错误" in str(ei.value)


@pytest.mark.asyncio
async def test_optimize_context_payload_mapping():
    # 纯字符串 context → full_text 白名单键；JSON 字符串 → dict
    assert engine_client._context_payload(None) is None
    assert engine_client._context_payload("  ") is None
    assert engine_client._context_payload({"synopsis": "x"}) == {"synopsis": "x"}
    assert engine_client._context_payload('{"setting": "唐朝"}') == {"setting": "唐朝"}
    assert engine_client._context_payload("普通文案") == {"full_text": "普通文案"}


# ─── 1.6 /health 探测 ───

@pytest.mark.asyncio
async def test_health_ok(fake_engine):
    info = await engine_client.health(fake_engine.base_url)
    assert info["ok"] is True
    assert isinstance(info["latency_ms"], float)


@pytest.mark.asyncio
async def test_health_non200_fails(fake_engine):
    fake_engine.health_status = 500
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.health(fake_engine.base_url)
    assert "HTTP 500" in str(ei.value)
    assert ei.value.stage == "engine_health"


@pytest.mark.asyncio
async def test_health_timeout_fails(monkeypatch, fake_engine):
    monkeypatch.setattr(engine_client, "HEALTH_TIMEOUT_SECONDS", 1)
    fake_engine.health_sleep = 2
    with pytest.raises(engine_client.EngineUnavailableError) as ei:
        await engine_client.health(fake_engine.base_url)
    assert "超时" in str(ei.value)


# ─── API 层（真 ASGI + 隔离 DB） ───

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


def _headers(role="user", username="u1"):
    from datetime import datetime, timedelta, timezone
    from jose import jwt

    payload = {"sub": username, "username": username, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _valid_case(compare_mode="single", **extra):
    body = {
        "title": "唐代老妇评测", "source_text": "一个老妇人在做饭",
        "prompt_zh": "写实风格，一位穿唐代襦裙的老妇人在土灶前用柴火做饭",
        "provider": "minimax-image", "model": "image-01",
        "image_count": 1, "aspect_ratio": "1:1",
        "compare_mode": compare_mode,
    }
    body.update(extra)
    return body


async def _seed_provider_keys(client, admin):
    await client.put("/api/v1/prompt-eval/providers", json={
        "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
    }, headers=admin)


@pytest.mark.asyncio
async def test_compare_mode_validation():
    async with _client() as client:
        h = _headers()
        ok = await client.post("/api/v1/prompt-eval/cases", json=_valid_case("dual"), headers=h)
        assert ok.status_code == 200, ok.text
        data = ok.json()
        assert data["compare_mode"] == "dual"
        assert data["engine_params"]["creative_level"] == 8
        assert data["engine_params"]["num_candidates"] == 3
        bad = [
            ({"compare_mode": "triple"}, "compare_mode"),
            ({"compare_mode": "dual", "engine_creative_level": 0}, "creative_level"),
            ({"compare_mode": "dual", "engine_creative_level": 11}, "creative_level"),
            ({"compare_mode": "dual", "engine_num_candidates": 0}, "num_candidates"),
            ({"compare_mode": "dual", "engine_num_candidates": 6}, "num_candidates"),
        ]
        for extra, hint in bad:
            body = _valid_case(**extra) if "compare_mode" in extra else _valid_case("dual", **extra)
            r = await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)
            assert r.status_code == 400, f"{hint}: {r.text}"
        r = await client.post("/api/v1/prompt-eval/cases",
                              json=_valid_case("dual", engine_creative_level=5, engine_num_candidates=2), headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["engine_params"]["creative_level"] == 5
        assert r.json()["engine_params"]["num_candidates"] == 2
        # 显式 null → 回退默认（I12）
        rn = await client.post("/api/v1/prompt-eval/cases",
                               json=_valid_case("dual", engine_creative_level=None, engine_num_candidates=None), headers=h)
        assert rn.status_code == 200, rn.text
        assert rn.json()["engine_params"]["creative_level"] == 8
        assert rn.json()["engine_params"]["num_candidates"] == 3


@pytest.mark.asyncio
async def test_single_mode_regression(monkeypatch):
    """既有 single 契约零变化：runs 只有 manual，返回 run dict 而非复合体。"""
    import services.prompt_eval_service as svc

    async with _client() as client:
        admin, h = _headers(role="admin"), _headers()
        await _seed_provider_keys(client, admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        captured = {}

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            captured["run_id"] = run_id

        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "queued"
        assert data["prompt_variant"] == "manual"
        assert "pair_id" not in data
        assert "engineError" not in data
        assert (await client.get(f"/api/v1/prompt-eval/runs/{captured['run_id']}", headers=h)).status_code == 200


@pytest.mark.asyncio
async def test_dual_creates_two_variants(fake_engine, monkeypatch):
    """双路派生：manual+engine 两变体同 pair_id，engine 快照用引擎输出+机器翻译，各自独立起流水线。"""
    import services.prompt_eval_service as svc

    async def fake_translate(cfg, prompt_zh, http=None):
        return "A realistic old woman cooking in golden sunlight"

    monkeypatch.setenv("OPS_PROMPT_ENGINE_BASE_URL", fake_engine.base_url)
    monkeypatch.setattr(translation, "translate_prompt_zh", fake_translate)
    async with _client() as client:
        admin, h = _headers(role="admin"), _headers()
        await _seed_provider_keys(client, admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case("dual"), headers=h)).json()["id"]
        started = []

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            started.append({"run_id": run_id, "prompt_zh": case["prompt_zh"], "prompt_en": case["prompt_en"]})

        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["pair_id"]
        assert data["manual"]["prompt_variant"] == "manual"
        assert data["engine"]["prompt_variant"] == "engine"
        assert "engineError" not in data
        assert data["engine"]["prompt_zh"] == "写实风格，金色阳光下的老妇人，细节丰富"
        assert data["engine"]["prompt_en"] == "A realistic old woman cooking in golden sunlight"
        meta = data["engine"]["engine_meta"]
        assert meta["pair_id"] == data["pair_id"]
        assert meta["creative_level"] == 8 and meta["num_candidates"] == 3
        assert meta["max_length"] == 500
        assert meta["model_used"] == "test-model" and meta["tokens_used"] == 88
        # 两条流水线独立启动，快照各自使用变体提示词
        assert {s["run_id"] for s in started} == {data["manual"]["id"], data["engine"]["id"]}
        assert {s["prompt_zh"] for s in started} == {
            "写实风格，一位穿唐代襦裙的老妇人在土灶前用柴火做饭",
            "写实风格，金色阳光下的老妇人，细节丰富",
        }
        assert {s["prompt_en"] for s in started} == {None, "A realistic old woman cooking in golden sunlight"}


@pytest.mark.asyncio
async def test_dual_engine_unavailable(fake_engine, monkeypatch):
    """引擎不可达：engineError=OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE，manual 正常创建并独立起流水线。"""
    import services.prompt_eval_service as svc

    fake_engine.close()  # 端口已关 → 连接拒绝（真网络栈）
    monkeypatch.setenv("OPS_PROMPT_ENGINE_BASE_URL", fake_engine.base_url)
    async with _client() as client:
        admin, h = _headers(role="admin"), _headers()
        await _seed_provider_keys(client, admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case("dual"), headers=h)).json()["id"]
        started = []

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            started.append(run_id)

        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["manual"]["prompt_variant"] == "manual"
        assert data["engine"] is None
        assert data["engineError"].startswith("OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE:")
        assert len(started) == 1 and started[0] == data["manual"]["id"]
        # W3：失败标记持久化到 manual run engine_meta，刷新详情仍可见
        detail = (await client.get(f"/api/v1/prompt-eval/runs/{data['manual']['id']}", headers=h)).json()
        assert detail["engine_meta"]["pair_id"] == data["pair_id"]
        assert detail["engine_meta"]["engine_error"].startswith("OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE:")


@pytest.mark.asyncio
async def test_dual_translate_failure_marked(fake_engine, monkeypatch):
    """引擎成功但翻译失败：engineError=engine_translate 阶段标记，不静默降级，manual 不受影响。"""
    import services.prompt_eval_service as svc

    async def boom(cfg, prompt_zh, http=None):
        raise RuntimeError("llm provider down")

    monkeypatch.setenv("OPS_PROMPT_ENGINE_BASE_URL", fake_engine.base_url)
    monkeypatch.setattr(translation, "translate_prompt_zh", boom)
    async with _client() as client:
        admin, h = _headers(role="admin"), _headers()
        await _seed_provider_keys(client, admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case("dual"), headers=h)).json()["id"]
        started = []

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            started.append(run_id)

        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["manual"]["id"] in started
        assert data["engine"] is None
        assert data["engineError"].startswith("engine_translate:")


# ─── 聚合：双路对比统计 ───

def _run_row(case_id, variant, pair_id, score, grade="good", dims=None, succeeded=True):
    from models import PromptEvalRun
    return PromptEvalRun(
        case_id=case_id, provider="minimax-image", model="image-01",
        status="succeeded" if succeeded else "failed",
        eval_status="succeeded" if succeeded else "failed",
        prompt_variant=variant,
        engine_meta=json.dumps({"pair_id": pair_id}, ensure_ascii=False),
        overall_score=score if succeeded else None,
        grade=grade if succeeded else None,
        dimensions=json.dumps(dims or [], ensure_ascii=False) if succeeded else None,
        created_by="u1",
    )


@pytest.mark.asyncio
async def test_dual_summary_paired_stats():
    """双路聚合：只统计 manual+engine 均成功的成对 run，输出平均分差/提升率/维度差/等级分布差。"""
    from database import async_session
    from models import PromptEvalRun

    async with async_session() as db:
        db.add_all([
            _run_row(1, "manual", "p1", 80, "good", [{"id": "relevance", "score": 80}]),
            _run_row(1, "engine", "p1", 88, "excellent", [{"id": "relevance", "score": 90}]),
            _run_row(1, "manual", "p2", 75, "good", [{"id": "relevance", "score": 75}]),
            _run_row(1, "engine", "p2", 90, "excellent", [{"id": "relevance", "score": 92}]),
        ])
        await db.commit()
        data = await svc.summary(db)
    dual = data["dual"]
    assert dual["pairCount"] == 2
    assert dual["manualAverage"] == 77.5
    assert dual["engineAverage"] == 89.0
    assert dual["averageDiff"] == 11.5
    assert dual["improvementRate"] == 14.8  # (89-77.5)/77.5*100
    assert dual["dimensionDiffs"] == [{"id": "relevance", "manualAverage": 77.5, "engineAverage": 91.0, "diff": 13.5}]
    assert dual["gradeDistributionDiff"]["good"] == {"manual": 2, "engine": 0, "diff": -2}
    assert dual["gradeDistributionDiff"]["excellent"] == {"manual": 0, "engine": 2, "diff": 2}


@pytest.mark.asyncio
async def test_dual_summary_zero_denominator_null():
    """manual 平均分 0 → improvementRate 为 null（不除零）。"""
    from database import async_session

    async with async_session() as db:
        db.add_all([
            _run_row(1, "manual", "p1", 0, "poor", [{"id": "relevance", "score": 0}]),
            _run_row(1, "engine", "p1", 50, "fair", [{"id": "relevance", "score": 50}]),
        ])
        await db.commit()
        data = await svc.summary(db)
    assert data["dual"]["pairCount"] == 1
    assert data["dual"]["improvementRate"] is None


@pytest.mark.asyncio
async def test_dual_summary_no_pairs_empty():
    """无双路配对（无 pair_id / 单路失败）→ dual 为空对象，不影响既有聚合。"""
    from database import async_session

    async with async_session() as db:
        db.add(_run_row(1, "manual", None, 80))
        db.add(_run_row(1, "engine", "orphan", 90))  # 无对应 manual
        await db.commit()
        data = await svc.summary(db)
    assert data["dual"] == {}
    assert data["recordCount"] == 2


@pytest.mark.asyncio
async def test_state_machine_independence(fake_engine, monkeypatch):
    """engine 变体失败不拖累 manual：summary 只统计双路均成功的成对。"""
    from database import async_session
    from models import PromptEvalRun

    async def fake_translate(cfg, prompt_zh, http=None):
        return "EN"

    monkeypatch.setenv("OPS_PROMPT_ENGINE_BASE_URL", fake_engine.base_url)
    monkeypatch.setattr(translation, "translate_prompt_zh", fake_translate)
    async with _client() as client:
        admin, h = _headers(role="admin"), _headers()
        await _seed_provider_keys(client, admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case("dual"), headers=h)).json()["id"]
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        created = r.json()
        # manual 走完生成+评估；engine 流水线失败
        async with async_session() as db:
            manual = await svc.get_run(db, created["manual"]["id"])
            manual.status = "succeeded"
            manual.eval_status = "succeeded"
            manual.overall_score = 85.0
            manual.grade = "good"
            manual.dimensions = json.dumps([{"id": "relevance", "score": 85}], ensure_ascii=False)
            engine_run = await svc.get_run(db, created["engine"]["id"])
            engine_run.status = "failed"
            engine_run.eval_status = "failed"
            engine_run.error = "generation: provider 500"
            await db.commit()
            data = await svc.summary(db)
        assert data["recordCount"] == 1  # 只有 manual 计入
        assert data["dual"] == {}  # engine 无 succeeded 行 → 不成对


# ─── engine/status 探测 ───

@pytest.mark.asyncio
async def test_engine_status_endpoint(fake_engine, monkeypatch):
    monkeypatch.setenv("OPS_PROMPT_ENGINE_BASE_URL", fake_engine.base_url)
    async with _client() as client:
        # 非 admin → 403
        assert (await client.get("/api/v1/prompt-eval/engine/status", headers=_headers(role="user"))).status_code == 403
        # admin + 引擎正常 → 200
        r = await client.get("/api/v1/prompt-eval/engine/status", headers=_headers(role="admin"))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["base_url"] == fake_engine.base_url
        assert isinstance(data["latency_ms"], float)
        # 引擎异常 → 503 + 错误码
        fake_engine.health_status = 500
        r2 = await client.get("/api/v1/prompt-eval/engine/status", headers=_headers(role="admin"))
        assert r2.status_code == 503
        assert "OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE" in r2.json()["detail"]


# ─── 迁移幂等 ───

@pytest.mark.asyncio
async def test_migration_dual_columns_idempotent():
    """存量旧表（无新列）→ ALTER 补列；重复执行幂等不报错。"""
    from database import async_session

    async with async_session() as db:
        await db.execute(sa.text("DROP TABLE IF EXISTS prompt_eval_runs"))
        await db.execute(sa.text("DROP TABLE IF EXISTS prompt_eval_cases"))
        await db.execute(sa.text(
            "CREATE TABLE prompt_eval_cases (id INTEGER PRIMARY KEY, title VARCHAR(200), prompt_zh TEXT, source_text TEXT)"))
        await db.execute(sa.text(
            "CREATE TABLE prompt_eval_runs (id INTEGER PRIMARY KEY, case_id INTEGER, prompt_variant VARCHAR(16))"))
        await db.commit()
        await ensure_prompt_eval_dual_columns(db)
        await ensure_prompt_eval_dual_columns(db)  # 幂等
        cases_cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        runs_cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
    assert {"compare_mode", "engine_params"} <= cases_cols
    assert {"prompt_variant", "prompt_source_zh", "engine_meta", "prompt_zh", "prompt_en"} <= runs_cols
