"""PromptEval 视频评测 API 测试：media_type 矩阵 / 密钥提示 / 流水线分支 / 媒体授权。"""
import os
import pathlib
import sys
import tempfile
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RUN_ID = uuid.uuid4().hex[:8]
os.environ["OPS_DB_PATH"] = os.path.join(tempfile.gettempdir(), f"ops_pev_{_RUN_ID}.db")
os.environ["OPS_CONFIG_OUTPUT_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pev_cfg_{_RUN_ID}")
os.environ["OPS_PROMPT_EVAL_MEDIA_DIR"] = os.path.join(tempfile.gettempdir(), f"ops_pev_media_{_RUN_ID}")
os.environ["OPS_SECRET_KEY"] = "test-secret"
os.environ["OPS_JWT_SECRET"] = "test-secret"
os.environ["OPS_CATALOG_API_KEY"] = "catalog-test-key"
os.environ["OPS_PROMPT_EVAL_VISION_API_KEY"] = "vision-test-key"
os.environ["OPS_PROMPT_EVAL_LLM_BASE_URL"] = "https://x/v1"
os.environ["OPS_PROMPT_EVAL_LLM_MODEL"] = "MiniMax-M2.7"
os.environ["OPS_PROMPT_EVAL_LLM_API_KEY"] = "llm-test-key"

import models  # noqa: F401
from config import settings  # noqa: E402

PNG_HEAD = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


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


def _video_case():
    return {
        "title": "视频评测", "source_text": "一只猫在草地上奔跑",
        "prompt_zh": "写实风格，一只橘猫在春日草地上由远及近奔跑，镜头跟随",
        "provider": "agnes-video", "model": "agnes-video-v2.0",
        "media_type": "video",
    }


def _video_eval_json():
    dims = [{"id": d, "score": 80, "evidence": "帧内可见", "issues": [], "suggestions": []}
            for d in ("temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality")]
    return {"overall": 80, "dimensions": dims, "problems": [], "promptOptimizationPoints": []}


@pytest.mark.asyncio
async def test_video_case_validation_matrix():
    async with _client() as client:
        h = _headers()
        r = await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["media_type"] == "video"
        cid = r.json()["id"]
        # 非法 media_type
        assert (await client.post("/api/v1/prompt-eval/cases", json={**_video_case(), "media_type": "audio"}, headers=h)).status_code == 400
        # 场景模式 + 视频 → 明确拒绝
        r2 = await client.post("/api/v1/prompt-eval/cases", json={**_video_case(), "source_mode": "scene"}, headers=h)
        assert r2.status_code == 400
        assert "场景模式暂不支持视频评测" in r2.json()["detail"]
        # 详情返回 media_type
        detail = (await client.get(f"/api/v1/prompt-eval/cases/{cid}", headers=h)).json()
        assert detail["case"]["media_type"] == "video"
        # 图片 case 默认 media_type=image
        img = await client.post("/api/v1/prompt-eval/cases", json={
            "title": "图", "source_text": "s", "prompt_zh": "p", "provider": "minimax-image", "model": "image-01",
        }, headers=h)
        assert img.status_code == 200
        assert img.json()["media_type"] == "image"


@pytest.mark.asyncio
async def test_video_run_requires_video_key_and_rejects_dual():
    async with _client() as client:
        h = _headers()
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)).json()["id"]
        # dual + video → 400
        dual = await client.post("/api/v1/prompt-eval/cases", json={**_video_case(), "compare_mode": "dual"}, headers=h)
        assert dual.status_code == 400
        assert "双路对比" in dual.json()["detail"]
        # 未配置视频密钥 → 400 角色感知提示（admin）
        r = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=_headers(role="admin"))
        assert r.status_code == 400, r.text
        assert "视频生成模型" in r.json()["detail"]
        # 非 admin 提示联系管理员
        r2 = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
        assert r2.status_code == 400
        assert "联系管理员" in r2.json()["detail"]
        # 配置密钥后可启动（start_run_pipeline 被 mock，不真实生成）
        import services.prompt_eval_service as svc

        def fake_start(factory, run_id, case, gen_cfg, eval_cfg):
            return None

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(svc, "start_run_pipeline", fake_start)
        try:
            await client.put("/api/v1/prompt-eval/providers", json={
                "provider": "agnes-video", "model": "agnes-video-v2.0",
                "api_key": "sk-test", "base_url": "https://apihub.agnes-ai.com/v1",
            }, headers=_headers(role="admin"))
            r3 = await client.post(f"/api/v1/prompt-eval/cases/{cid}/runs", headers=h)
            assert r3.status_code == 200, r3.text
            assert r3.json()["status"] == "queued"
        finally:
            monkeypatch.undo()


@pytest.mark.asyncio
async def test_video_run_pipeline_real_branch(monkeypatch):
    """真实 run_pipeline 视频分支：ORM 行传入（回归 case[...] 归一化）+ mock 生成/评估。"""
    from services import prompt_eval_service as svc
    import services.prompt_eval_generation_service as gen_mod
    from services import prompt_eval_evaluation_service as ev

    media_dir = pathlib.Path(os.environ["OPS_PROMPT_EVAL_MEDIA_DIR"])
    media_dir.mkdir(parents=True, exist_ok=True)

    async def fake_generate_video(cfg, prompt, out_dir, run_id, http=None, **kw):
        out = pathlib.Path(out_dir)
        (out / f"run_{run_id}_video.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
        for i in range(3):
            (out / f"run_{run_id}_frame_{i}.png").write_bytes(PNG_HEAD)
        return {"video": f"run_{run_id}_video.mp4", "frames": [f"run_{run_id}_frame_{i}.png" for i in range(3)]}

    async def fake_evaluate(cfg, prompt, images, http=None):
        assert len(images) == 3
        return "{\"overall\": 80, \"dimensions\": [" + ",".join(
            f'{{"id": "{d}", "score": 80, "evidence": "e", "issues": [], "suggestions": []}}'
            for d in ("temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality")
        ) + "], \"problems\": [], \"promptOptimizationPoints\": []}"

    async with _client() as client:
        h = _headers(role="admin")
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "agnes-video", "model": "agnes-video-v2.0",
            "api_key": "sk-test", "base_url": "https://apihub.agnes-ai.com/v1",
        }, headers=h)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)).json()["id"]
        # 直连 run_pipeline（ORM 行），避开后台任务
        from database import async_session
        async with async_session() as db:
            from models import PromptEvalCase
            from sqlalchemy import select
            row = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id == cid))).scalar_one()
            gen_cfg = await svc.get_provider_key(db, row.provider, row.model, "test-secret")
            vision_cfg = await svc.get_vision_key(db, "test-secret")
            created = await svc.create_run(db, row, "u1")
            run_id = created["id"]

        monkeypatch.setattr(svc.video_service, "generate_video", fake_generate_video)
        monkeypatch.setattr(ev, "evaluate_images", fake_evaluate)

        async with async_session() as db:
            result = await svc.run_pipeline(db, run_id, row, gen_cfg, vision_cfg)
        assert result["status"] == "succeeded", result
        assert result["eval_status"] == "succeeded"
        assert result["video_path"] == f"run_{run_id}_video.mp4"
        assert len(result["video_frames"]) == 3
        assert result["overall_score"] == 80
        dim_ids = [d["id"] for d in result["dimensions"]]
        assert dim_ids == ["temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality"]
        # 媒体授权：owner 可访问视频文件，其他用户 404
        vpath = result["video_path"]
        owner = await client.get(f"/api/v1/prompt-eval/media/{vpath}", headers=h)
        assert owner.status_code == 200, owner.text
        stranger = await client.get(f"/api/v1/prompt-eval/media/{vpath}", headers=_headers(username="other"))
        assert stranger.status_code == 404


@pytest.mark.asyncio
async def test_video_generation_failure_fail_closed(monkeypatch):
    """视频生成失败 → run failed，不写评估。"""
    from services import prompt_eval_service as svc
    from services import prompt_eval_video_service as vmod
    from services import prompt_eval_evaluation_service as ev

    async def fake_fail(cfg, prompt, out_dir, run_id, http=None, **kw):
        raise vmod.VideoGenerationError("provider 队列满载")

    async with _client() as client:
        h = _headers(role="admin")
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "agnes-video", "model": "agnes-video-v2.0",
            "api_key": "sk-test", "base_url": "https://apihub.agnes-ai.com/v1",
        }, headers=h)
        cid = (await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)).json()["id"]
        from database import async_session
        from models import PromptEvalCase
        from sqlalchemy import select
        async with async_session() as db:
            row = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id == cid))).scalar_one()
            gen_cfg = await svc.get_provider_key(db, row.provider, row.model, "test-secret")
            vision_cfg = await svc.get_vision_key(db, "test-secret")
            created = await svc.create_run(db, row, "u1")
            run_id = created["id"]

        monkeypatch.setattr(svc.video_service, "generate_video", fake_fail)
        called = {"n": 0}

        async def fake_evaluate(cfg, prompt, images, http=None):
            called["n"] += 1
            return "{}"

        monkeypatch.setattr(ev, "evaluate_images", fake_evaluate)
        async with async_session() as db:
            result = await svc.run_pipeline(db, run_id, row, gen_cfg, vision_cfg)
        assert result["status"] == "failed"
        assert "队列满载" in result["error"]
        assert called["n"] == 0
        assert result["eval_status"] == "pending"


@pytest.mark.asyncio
async def test_media_auth_scoped_to_owning_case(monkeypatch):
    """C1 回归：拥有任意媒体 case 的用户不能读取他人 case 的媒体文件（越权修复）。"""
    from services import prompt_eval_service as svc
    from services import prompt_eval_evaluation_service as ev
    from database import async_session
    from models import PromptEvalCase
    from sqlalchemy import select

    async def fake_generate_video(cfg, prompt, out_dir, run_id, http=None, **kw):
        out = pathlib.Path(out_dir)
        (out / f"run_{run_id}_video.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
        for i in range(3):
            (out / f"run_{run_id}_frame_{i}.png").write_bytes(PNG_HEAD)
        return {"video": f"run_{run_id}_video.mp4", "frames": [f"run_{run_id}_frame_{i}.png" for i in range(3)]}

    async def fake_evaluate(cfg, prompt, images, http=None):
        return "{\"overall\": 80, \"dimensions\": [" + ",".join(
            f'{{"id": "{d}", "score": 80, "evidence": "e", "issues": [], "suggestions": []}}'
            for d in ("temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality")
        ) + "], \"problems\": [], \"promptOptimizationPoints\": []}"

    monkeypatch.setattr(svc.video_service, "generate_video", fake_generate_video)
    monkeypatch.setattr(ev, "evaluate_images", fake_evaluate)

    async with _client() as client:
        h_admin = _headers(role="admin", username="root")
        # 密钥由 admin 配置；媒体授权测试用普通用户（admin 绕过所有权）
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "agnes-video", "model": "agnes-video-v2.0",
            "api_key": "sk-test", "base_url": "https://apihub.agnes-ai.com/v1",
        }, headers=h_admin)
        files = {}
        for name in ("alice", "bob"):
            h = _headers(username=name)
            cid = (await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)).json()["id"]
            async with async_session() as db:
                row = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id == cid))).scalar_one()
                gen_cfg = await svc.get_provider_key(db, row.provider, row.model, "test-secret")
                vision_cfg = await svc.get_vision_key(db, "test-secret")
                created = await svc.create_run(db, row, name)
                run_id = created["id"]
            async with async_session() as db:
                result = await svc.run_pipeline(db, run_id, row, gen_cfg, vision_cfg)
            assert result["status"] == "succeeded", result
            files[name] = result["video_path"]
        # bob 有自己的媒体 case（旧代码会因 any() 误放行），读取 alice 的媒体必须 404
        bob_gets_alice = await client.get(f"/api/v1/prompt-eval/media/{files['alice']}", headers=_headers(username="bob"))
        assert bob_gets_alice.status_code == 404, bob_gets_alice.text
        alice_gets_alice = await client.get(f"/api/v1/prompt-eval/media/{files['alice']}", headers=_headers(username="alice"))
        assert alice_gets_alice.status_code == 200
        bob_gets_bob = await client.get(f"/api/v1/prompt-eval/media/{files['bob']}", headers=_headers(username="bob"))
        assert bob_gets_bob.status_code == 200


@pytest.mark.asyncio
async def test_scene_snapshot_media_type_and_update_guards(monkeypatch):
    """C2/I7/I10 回归：scene 快照带 media_type；scene case 禁止改 video；video case 省略 media_type 保留原值；
    防御路径：dict 缺 media_type 时按 image 处理（run_pipeline 不 KeyError）。"""
    from services import prompt_eval_service as svc
    from services import prompt_eval_evaluation_service as ev
    from database import async_session
    from models import PromptEvalCase, PromptEvalScene
    from sqlalchemy import select

    async def fake_generate_images(cfg, prompt, count, ratio, out_dir, run_id, http=None, **kw):
        out = pathlib.Path(out_dir)
        names = []
        for i in range(count):
            name = f"run_{run_id}_{i}.png"
            (out / name).write_bytes(PNG_HEAD)
            names.append(name)
        return names

    async def fake_evaluate(cfg, prompt, images, http=None):
        dims = [{"id": d, "score": 80, "evidence": "e", "issues": [], "suggestions": []}
                for d in ("relevance", "content_accuracy", "aesthetic_quality")]
        return "{\"overall\": 80, \"dimensions\": " + str(dims).replace("'", "\"") + ", \"problems\": [], \"promptOptimizationPoints\": []}"

    monkeypatch.setattr(svc.generation, "generate_images", fake_generate_images)
    monkeypatch.setattr(ev, "evaluate_images", fake_evaluate)

    async with _client() as client:
        h = _headers(role="admin", username="u1")
        await client.put("/api/v1/prompt-eval/providers", json={
            "provider": "minimax-image", "model": "image-01",
            "api_key": "sk-img", "base_url": "https://api.minimaxi.com/v1",
        }, headers=h)
        # scene case
        r = await client.post("/api/v1/prompt-eval/cases", json={
            "title": "场景", "source_text": "第一句。第二句。", "source_mode": "scene",
            "provider": "minimax-image", "model": "image-01",
        }, headers=h)
        assert r.status_code == 200, r.text
        scene_case_id = r.json()["case"]["id"]
        # scene case 改 video → 400（PUT 不带 source_mode 也不可绕过）
        upd = await client.put(f"/api/v1/prompt-eval/cases/{scene_case_id}", json={
            "title": "场景", "source_text": "第一句。第二句。", "prompt_zh": "提示词",
            "media_type": "video", "provider": "agnes-video", "model": "agnes-video-v2.0",
        }, headers=h)
        assert upd.status_code == 400
        assert "场景模式暂不支持视频评测" in upd.json()["detail"]
        # video case；PUT 省略 media_type → 保留 video（不静默翻回 image）
        vid = (await client.post("/api/v1/prompt-eval/cases", json=_video_case(), headers=h)).json()["id"]
        upd2 = await client.put(f"/api/v1/prompt-eval/cases/{vid}", json={
            "title": "改了", "source_text": "新文案", "prompt_zh": "新提示词",
            "provider": "agnes-video", "model": "agnes-video-v2.0",
        }, headers=h)
        assert upd2.status_code == 200, upd2.text
        assert upd2.json()["media_type"] == "video"
        # scene_snapshot 含 media_type（C2 根因）；dict 缺 media_type 时 run_pipeline 按 image 兜底
        async with async_session() as db:
            case = (await db.execute(select(PromptEvalCase).where(PromptEvalCase.id == scene_case_id))).scalar_one()
            scene = (await db.execute(select(PromptEvalScene).where(PromptEvalScene.case_id == scene_case_id))).scalar_one()
            snap = svc.scene_snapshot(scene, case)
            assert snap["media_type"] == "image"
            gen_cfg = await svc.get_provider_key(db, case.provider, case.model, "test-secret")
            vision_cfg = await svc.get_vision_key(db, "test-secret")
            created = await svc.create_scene_run(db, scene, case, "u1")
            run_id = created["id"]
        async with async_session() as db:
            bare = dict(snap)
            bare.pop("media_type", None)
            result = await svc.run_pipeline(db, run_id, bare, gen_cfg, vision_cfg)
        assert result["status"] == "succeeded", result
        assert result["eval_status"] == "succeeded"
