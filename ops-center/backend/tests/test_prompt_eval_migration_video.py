"""prompt_eval 视频列迁移测试：存量旧库补 media_type/video_path/video_frames 列且幂等。"""
import os
import sys
import tempfile
import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.prompt_eval_migration import ensure_prompt_eval_video_columns  # noqa: E402

_DB = os.path.join(tempfile.gettempdir(), f"ops_pe_migv_{uuid.uuid4().hex[:8]}.db")


@pytest.mark.asyncio
async def test_video_migration_adds_columns_and_is_idempotent():
    engine = create_async_engine(f"sqlite+aiosqlite:///{_DB}")
    # 构造旧库：cases 无 media_type，runs 无 video_path/video_frames（模拟 PR #571 后的存量库）
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_cases (id INTEGER PRIMARY KEY, title VARCHAR(200) DEFAULT '',"
            " source_mode VARCHAR(16) DEFAULT 'manual', source_text TEXT NOT NULL, context TEXT,"
            " prompt_zh TEXT NOT NULL, prompt_en TEXT, prompt_en_source VARCHAR(32),"
            " prompt_en_translated_at VARCHAR, prompt_en_cache_zh TEXT,"
            " provider VARCHAR(64), model VARCHAR(128), image_count INTEGER DEFAULT 1,"
            " aspect_ratio VARCHAR(16) DEFAULT '1:1', compare_mode VARCHAR(16) DEFAULT 'single',"
            " engine_params TEXT, created_by VARCHAR(100), created_at VARCHAR,"
            " updated_at VARCHAR, deleted_at VARCHAR)"))
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_runs (id INTEGER PRIMARY KEY, case_id INTEGER, scene_id INTEGER,"
            " provider VARCHAR(64), model VARCHAR(128), status VARCHAR(16), eval_status VARCHAR(16),"
            " image_paths TEXT, video_path TEXT, overall_score INTEGER, grade VARCHAR(16),"
            " dimensions TEXT, problems TEXT, optimization_points TEXT, error TEXT,"
            " created_by VARCHAR(100), created_at VARCHAR, completed_at VARCHAR)"))
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "INSERT INTO prompt_eval_cases (id, source_text, prompt_zh) VALUES (1, '旧数据', '旧提示词')"))

    async with AsyncSession(engine) as db:
        await ensure_prompt_eval_video_columns(db)

    async with engine.connect() as conn:
        case_cols = {r[1] for r in (await conn.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        run_cols = {r[1] for r in (await conn.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
        assert "media_type" in case_cols
        assert "video_path" in run_cols
        assert "video_frames" in run_cols
        row = (await conn.execute(sa.text("SELECT media_type FROM prompt_eval_cases WHERE id=1"))).first()
        assert row[0] == "image"

    # 幂等：重复执行不报错
    async with AsyncSession(engine) as db:
        await ensure_prompt_eval_video_columns(db)

    await engine.dispose()
    if os.path.exists(_DB):
        os.remove(_DB)
