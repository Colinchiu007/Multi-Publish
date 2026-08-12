"""PromptEval Workbench API 测试：鉴权/校验矩阵/密钥/翻译/run/删除/聚合。"""
import os
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_pe_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pe_cfg_{_RUN_ID}")
os.environ["OPS_PROMPT_EVAL_MEDIA_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pe_media_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"
os.environ["OPS_PROMPT_EVAL_VISION_API_KEY"] = "vision-test-key"
os.environ["OPS_PROMPT_EVAL_LLM_BASE_URL"] = "https://x/v1"
os.environ["OPS_PROMPT_EVAL_LLM_MODEL"] = "MiniMax-M2.7"
os.environ["OPS_PROMPT_EVAL_LLM_API_KEY"] = "llm-test-key"

import models  # noqa: F401
from config import settings  # noqa: E402


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


def _valid_case():
    return {
        "title": "唐代老妇评测", "source_text": "一个老妇人在做饭",
        "prompt_zh": "写实风格，一位穿唐代襦裙的老妇人在土灶前用柴火做饭",
        "provider": "minimax-image", "model": "image-01",
        "image_count": 1, "aspect_ratio": "1:1",
    }


@pytest.mark.asyncio
async def test_case_validation_matrix():
    async with _client() as client:
        h = _headers()
        # 401
        assert (await client.post("/api/v1/prompt-eval/cases", json=_valid_case())).status_code == 401
        # 合法创建
        r = await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["prompt_en_source"] is None
        cid = r.json()["id"]
        # 校验矩阵
        bad = [
            ({**_valid_case(), "source_text": ""}, "source_text"),
            ({**_valid_case(), "source_text": "字" * 20001}, "source_text"),
            ({**_valid_case(), "prompt_zh": ""}, "prompt_zh"),
            ({**_valid_case(), "prompt_zh": "词" * 5001}, "prompt_zh"),
            ({**_valid_case(), "context": {"password": "x"}}, "敏感"),
            ({**_valid_case(), "context": {"nested": {"api_key": "sk"}}}, "敏感"),
            ({**_valid_case(), "image_count": 0}, "image_count"),
            ({**_valid_case(), "image_count": 21}, "image_count"),
            ({**_valid_case(), "aspect_ratio": "5:4"}, "aspect_ratio"),
            ({**_valid_case(), "provider": ""}, "provider"),
        ]
        for body, hint in bad:
            rr = await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)
            assert rr.status_code == 400, f"{hint}: {rr.text}"
        # 删除/不存在
        assert (await client.delete("/api/v1/prompt-eval/cases/999999", headers=h)).status_code == 404
        assert (await client.delete(f"/api/v1/prompt-eval/cases/{cid}", headers=h)).status_code == 200
        assert (await client.get(f"/api/v1/prompt-eval/cases/{cid}", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_provider_key_admin_only(monkeypatch):
    async with _client() as client:
        # 普通用户写密钥 → 403
        assert (await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=_headers(role="user"))).status_code == 403
        # admin 写密钥 → 200，不返回明文
        r = await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=_headers(role="admin"))
        assert r.status_code == 200, r.text
        assert "key_enc" not in r.json()
        lst = (await client.get("/api/v1/prompt-eval/providers", headers=_headers())).json()
        assert lst["items"][0]["provider"] == "minimax-image"
        # 校验：缺 api_key → 400
        assert (await client.put("/api/v1/prompt-eval/providers", json={"provider": "p", "model": "m"}, headers=_headers(role="admin"))).status_code == 400


@pytest.mark.asyncio
async def test_translate_machine_source(monkeypatch):
    import services.prompt_eval_service as svc

    async def fake_translate(db, row, cfg, http=None):
        row.prompt_en = "A realistic scene of an old woman..."
        row.prompt_en_source = "machine_translation"
        row.prompt_en_translated_at = "2026-08-12T00:00:00"
        await db.commit()
        return svc.case_to_dict(row)

    monkeypatch.setattr(svc, "translate_case", fake_translate)
    async with _client() as client:
        h = _headers()
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/translate", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["prompt_en_source"] == "machine_translation"
        assert r.json()["prompt_en"]


@pytest.mark.asyncio
async def test_run_requires_provider_key_and_pipeline(monkeypatch):
    import services.prompt_eval_service as svc

    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        # 未配置密钥 → 400 引导
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 400
        assert "模型密钥" in r.text
        # 配置密钥 → 创建 run（pipeline 打桩）
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=admin)
        captured = {}

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            captured["run_id"] = run_id
            captured["gen_cfg"] = gen_cfg
            return None

        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "queued"
        assert captured["gen_cfg"]["api_key"] == "sk-test"
        # 轮询 run
        run = await client.get(f"/api/v1/prompt-eval/runs/{captured['run_id']}", headers=h)
        assert run.status_code == 200 and run.json()["id"] == captured["run_id"]
        # case 详情含 runs
        detail = (await client.get(f"/api/v1/prompt-eval/cases/{cid}", headers=h)).json()
        assert len(detail["runs"]) == 1



@pytest.mark.asyncio
async def test_update_case_endpoint():
    async with _client() as client:
        h = _headers()
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        body = {**_valid_case(), "prompt_zh": "更新后的提示词"}
        r = await client.put(f"/api/v1/prompt-eval/cases/{cid}", json=body, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["prompt_zh"] == "更新后的提示词"
        assert (await client.put(f"/api/v1/prompt-eval/cases/{cid}", json={**_valid_case(), "image_count": 99}, headers=h)).status_code == 400
        assert (await client.put("/api/v1/prompt-eval/cases/999999", json=_valid_case(), headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_run_requires_vision_key(monkeypatch):
    import services.prompt_eval_service as svc
    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=admin)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        monkeypatch.delenv("OPS_PROMPT_EVAL_VISION_API_KEY")
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 502
        assert "视觉评估" in r.text


@pytest.mark.asyncio
async def test_media_unauthorized(monkeypatch):
    import services.prompt_eval_service as svc
    from services import prompt_eval_generation_service as gen
    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=h)).json()["id"]
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=admin)

        async def fake_pipeline(db, run_id, case, gen_cfg, eval_cfg, http=None):
            run = await svc.get_run(db, run_id)
            out = svc.media_dir(); out.mkdir(parents=True, exist_ok=True)
            png = gen.__dict__.get("PNG") or b""
            import base64 as b64
            png = b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            name = f"run_{run_id}_0.png"
            (out / name).write_bytes(png)
            run.image_paths = "[" + '"' + name + '"]'
            run.status = "succeeded"
            run.eval_status = "succeeded"
            run.overall_score = 80
            run.grade = "good"
            await db.commit()

        monkeypatch.setattr(svc, "run_pipeline", fake_pipeline)
        import asyncio
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r.status_code == 200, r.text
        await asyncio.sleep(0.3)  # 等待后台任务写入图片
        # 其他用户访问媒体 → 404
        other = _headers(username="other")
        run = (await client.get(f"/api/v1/prompt-eval/cases/{cid}", headers=h)).json()["runs"][0]
        img = run["image_paths"][0]
        assert (await client.get(f"/api/v1/prompt-eval/media/{img}", headers=other)).status_code == 404
        assert (await client.get(f"/api/v1/prompt-eval/media/{img}", headers=h)).status_code == 200

@pytest.mark.asyncio
async def test_summary_empty():
    async with _client() as client:
        r = await client.get("/api/v1/prompt-eval/summary", headers=_headers())
        assert r.status_code == 200
        assert r.json()["recordCount"] == 0
