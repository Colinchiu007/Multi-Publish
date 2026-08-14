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
async def test_scene_mode_create_and_list():
    async with _client() as client:
        h = _headers()
        body = {
            "source_mode": "scene",
            "title": "整篇文案评测",
            "source_text": "她点燃了柴火，架上铁锅。热气腾腾，香味飘散。她沿着小路走到院子里。",
            "provider": "minimax-image", "model": "image-01",
            "image_count": 1, "aspect_ratio": "1:1",
            "target_chars_per_scene": 20, "subtitle_min_chars": 8, "subtitle_max_chars": 15,
        }
        r = await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["case"]["source_mode"] == "scene"
        assert len(data["scenes"]) >= 2
        s0 = data["scenes"][0]
        assert s0["scene_text"]
        assert isinstance(s0["subtitle_blocks"], list)
        assert isinstance(s0["scene_context"], dict)
        # GET case 含 scenes
        detail = (await client.get(f"/api/v1/prompt-eval/cases/{data['case']['id']}", headers=h)).json()
        assert len(detail["scenes"]) == len(data["scenes"])
        # 校验：场景数上限 100 / 分句配置
        bad = {**body, "target_chars_per_scene": 0}
        assert (await client.post("/api/v1/prompt-eval/cases", json=bad, headers=h)).status_code == 400
        # 15 字/句 × 120 句 = 120 场景 > 100 → 400
        bad2 = {**body, "source_text": ("今天天气很好，我们去公园散步吧。" * 120)}
        rr = await client.post("/api/v1/prompt-eval/cases", json=bad2, headers=h)
        assert rr.status_code == 400, rr.text
        assert "场景数超过上限 100" in rr.json()["detail"], rr.text


@pytest.mark.asyncio
async def test_scene_translate(monkeypatch):
    import services.prompt_eval_service as svc

    async def fake_translate(db, scene, case, cfg, http=None):
        scene.prompt_zh = "写实风格，老妇人在土灶前用柴火做饭"
        scene.prompt_en = "A realistic scene of an old woman cooking over a fire"
        scene.prompt_en_source = "machine_translation"
        scene.prompt_en_translated_at = "2026-08-12T00:00:00"
        await db.commit()
        return svc.scene_to_dict(scene)

    monkeypatch.setattr(svc, "translate_scene", fake_translate)
    async with _client() as client:
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        sid = data["scenes"][0]["id"]
        cid = data["case"]["id"]
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["prompt_en_source"] == "machine_translation"
        assert r.json()["prompt_en"]


@pytest.mark.asyncio
async def test_scene_run_requires_keys(monkeypatch):
    import services.prompt_eval_service as svc
    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        cid = data["case"]["id"]
        sid = data["scenes"][0]["id"]

        # W3 fail closed：未生成中英对照 → 400（先于密钥校验）
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/runs", headers=h)
        assert r.status_code == 400
        assert "中英对照" in r.json()["detail"]

        # 先生成中英对照（fake LLM 写入 scene.prompt_zh）
        async def fake_translate(db, scene, case, cfg, http=None):
            scene.prompt_zh = "写实风格，老妇人在土灶前用柴火做饭"
            scene.prompt_en = "A realistic old woman cooking over a fire"
            scene.prompt_en_source = "machine_translation"
            scene.prompt_en_translated_at = "2026-08-12T00:00:00"
            await db.commit()
            return svc.scene_to_dict(scene)

        monkeypatch.setattr(svc, "translate_scene", fake_translate)
        tr = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert tr.status_code == 200, tr.text

        # 未配置密钥 → 400
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/runs", headers=h)
        assert r.status_code == 400
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-test", "base_url": "https://x/v1",
        }, headers=admin)
        captured = {}

        def fake_start(factory, run_id, snapshot, gen_cfg, eval_cfg):
            captured["run_id"] = run_id
            captured["snapshot"] = snapshot

        monkeypatch.setattr(svc, "start_scene_run_pipeline", fake_start)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/runs", headers=h)
        assert r.status_code == 200, r.text
        assert captured["snapshot"]["image_count"] == 1
        run = await client.get(f"/api/v1/prompt-eval/runs/{captured['run_id']}", headers=h)
        assert run.status_code == 200 and run.json()["scene_id"] == sid

        # W5 轻量轮询接口
        runs = await client.get(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert runs.status_code == 200
        assert any(x["id"] == captured["run_id"] for x in runs.json()["items"])
        assert "source_text" not in runs.json()["items"][0]


@pytest.mark.asyncio
async def test_scene_subtitle_timing_equal_effective():
    """W1：subtitle_timing=equal 必须真正生效（各字幕块时长均等），不是静默忽略。"""
    async with _client() as client:
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火架上铁锅慢慢烧水热气腾腾香味飘散沿着小路走到院子里",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1",
                "subtitle_timing": "equal"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        blocks = data["scenes"][0]["subtitle_blocks"]
        assert len(blocks) >= 2
        durs = {round(b["duration"], 2) for b in blocks}
        assert len(durs) == 1, f"equal 模式下各块时长应一致，实际 {sorted(b['duration'] for b in blocks)}"

@pytest.mark.asyncio
async def test_translate_uses_llm_key_from_provider_table(monkeypatch):
    """「模型密钥」页配置 minimax-llm 后，中英对照应使用表内密钥（优先于环境变量）。"""
    import services.prompt_eval_translation_service as tr

    captured = {}

    async def fake_optimize(cfg, source_text, scene_text, scene_context, http=None):
        captured["cfg"] = cfg
        return "写实风格，老妇人在土灶前用柴火做饭"

    async def fake_translate(cfg, text, http=None):
        return "A realistic old woman cooking over a fire"

    monkeypatch.setattr(tr, "optimize_scene_prompt", fake_optimize)
    monkeypatch.setattr(tr, "translate_prompt_zh", fake_translate)
    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        # admin 在「模型密钥」配置 minimax-llm
        r = await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-llm", "model": "MiniMax-M2.7",
            "api_key": "sk-table-llm-001", "base_url": "https://llm.example/v1",
        }, headers=admin)
        assert r.status_code == 200, r.text
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火，架上铁锅。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        cid = data["case"]["id"]
        sid = data["scenes"][0]["id"]
        resp = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert resp.status_code == 200, resp.text
        assert captured["cfg"]["api_key"] == "sk-table-llm-001"
        assert captured["cfg"]["base_url"] == "https://llm.example/v1"
        assert captured["cfg"]["model"] == "MiniMax-M2.7"


@pytest.mark.asyncio
async def test_scene_translate_requires_llm_key(monkeypatch):
    """回归：未配置 minimax-llm 且无 OPS_PROMPT_EVAL_LLM_API_KEY 时，中英对照应 fail-fast 给出明确 400，
    而不是带空 api_key 请求上游后返回误导性 502（用户报「批量生成 0 成功 3 失败」）。"""
    monkeypatch.delenv("OPS_PROMPT_EVAL_LLM_API_KEY", raising=False)
    async with _client() as client:
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        cid = data["case"]["id"]
        sid = data["scenes"][0]["id"]
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert r.status_code == 400, r.text
        assert "LLM 密钥" in r.json()["detail"]


@pytest.mark.asyncio
async def test_provider_test_endpoint_admin_only(monkeypatch):
    import services.prompt_eval_service as svc

    async def fake_test(db, body, secret, http=None):
        return {"ok": True, "detail": "连接成功（chat/completions 可达）"}

    monkeypatch.setattr(svc, "test_provider_connection", fake_test)
    async with _client() as client:
        body = {"provider": "minimax-llm", "model": "MiniMax-M2.7", "api_key": "sk", "base_url": "https://x/v1"}
        # 非 admin → 403
        r = await client.post("/api/v1/prompt-eval/providers/test", json=body, headers=_headers(role="user"))
        assert r.status_code == 403
        # admin → 200
        r2 = await client.post("/api/v1/prompt-eval/providers/test", json=body, headers=_headers(role="admin"))
        assert r2.status_code == 200, r2.text
        assert r2.json()["ok"] is True
        # 未登录 → 401
        r3 = await client.post("/api/v1/prompt-eval/providers/test", json=body)
        assert r3.status_code == 401


@pytest.mark.asyncio
async def test_vision_key_supports_opencode_go(monkeypatch):
    """视觉评估支持 opencode-go-vision（Opencode-Go 视觉模型，OpenAI 兼容 base_url）。"""
    import services.prompt_eval_service as svc

    def fake_start(factory, run_id, snapshot, gen_cfg, eval_cfg):
        captured["eval_cfg"] = eval_cfg

    captured = {}
    monkeypatch.setattr(svc, "start_scene_run_pipeline", fake_start)
    async with _client() as client:
        admin = _headers(role="admin")
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        cid = data["case"]["id"]
        sid = data["scenes"][0]["id"]
        # 配置生图 + LLM + opencode-go-vision 视觉
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01", "api_key": "sk-img", "base_url": "https://x/v1",
        }, headers=admin)
        async def fake_translate(db, scene, case, cfg, http=None):
            scene.prompt_zh = "写实风格，老妇人做饭"
            scene.prompt_en = "A realistic scene"
            scene.prompt_en_source = "machine_translation"
            scene.prompt_en_translated_at = "2026-08-12T00:00:00"
            await db.commit()
            return svc.scene_to_dict(scene)
        monkeypatch.setattr(svc, "translate_scene", fake_translate)
        await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "opencode-go-vision", "model": "opencode-go-vision",
            "api_key": "sk-oc-vision", "base_url": "https://opencode.ai/zen/go/v1",
        }, headers=admin)
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/runs", headers=h)
        assert r.status_code == 200, r.text
        assert captured["eval_cfg"]["base_url"] == "https://opencode.ai/zen/go/v1"
        assert captured["eval_cfg"]["api_key"] == "sk-oc-vision"


@pytest.mark.asyncio
async def test_scene_translate_idempotent_cache(monkeypatch):
    """真实 translate_scene 幂等缓存：7 天内同 prompt_zh 复用，不重复调用 LLM（回归 prompt_en_cache_zh 缺失崩溃）。"""
    import services.prompt_eval_service as svc
    import services.prompt_eval_translation_service as tr

    calls = {"opt": 0, "tr": 0}

    async def fake_optimize(cfg, source_text, scene_text, scene_context, http=None):
        calls["opt"] += 1
        return "写实风格，老妇人在土灶前用柴火做饭"

    async def fake_translate(cfg, text, http=None):
        calls["tr"] += 1
        return "A realistic old woman cooking over a fire"

    monkeypatch.setattr(tr, "optimize_scene_prompt", fake_optimize)
    monkeypatch.setattr(tr, "translate_prompt_zh", fake_translate)
    async with _client() as client:
        h = _headers()
        body = {"source_mode": "scene", "title": "t", "source_text": "她点燃了柴火，架上铁锅。",
                "provider": "minimax-image", "model": "image-01", "image_count": 1, "aspect_ratio": "1:1"}
        data = (await client.post("/api/v1/prompt-eval/cases", json=body, headers=h)).json()
        cid = data["case"]["id"]
        sid = data["scenes"][0]["id"]
        r1 = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert r1.status_code == 200, r1.text
        assert calls["opt"] == 1 and calls["tr"] == 1
        assert r1.json()["prompt_en_source"] == "machine_translation"
        # 第二次：缓存命中，不重复调用 LLM
        r2 = await client.post(f"/api/v1/prompt-eval/cases/{cid}/scenes/{sid}/translate", headers=h)
        assert r2.status_code == 200, r2.text
        assert calls["opt"] == 1 and calls["tr"] == 1
        assert r2.json()["prompt_zh"] == r1.json()["prompt_zh"]


@pytest.mark.asyncio
async def test_summary_empty():
    async with _client() as client:
        r = await client.get("/api/v1/prompt-eval/summary", headers=_headers())
        assert r.status_code == 200
        assert r.json()["recordCount"] == 0



@pytest.mark.asyncio
async def test_run_provider_key_message_role_aware():
    """未配置图片生成模型密钥时，提示按角色区分：admin 引导到「模型密钥」，非 admin 提示联系管理员。"""
    async with _client() as client:
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_valid_case(), headers=_headers())).json()["id"]
        r_admin = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=_headers(role="admin"))
        assert r_admin.status_code == 400
        assert "侧边栏「模型密钥」" in r_admin.text and "/model-keys" in r_admin.text
        r_user = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=_headers())
        assert r_user.status_code == 400
        assert "联系管理员" in r_user.text and "模型密钥" in r_user.text
