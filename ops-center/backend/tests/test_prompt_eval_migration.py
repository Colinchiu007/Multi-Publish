"""prompt_eval 场景列迁移测试：存量旧库（无 source_mode/scene_id 列）补列幂等。"""
import os
import sys
import tempfile
import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.prompt_eval_migration import ensure_prompt_eval_scene_columns  # noqa: E402

_DB = os.path.join(tempfile.gettempdir(), f"ops_pe_mig_{uuid.uuid4().hex[:8]}.db")


@pytest.mark.asyncio
async def test_migration_adds_columns_and_is_idempotent():
    engine = create_async_engine(f"sqlite+aiosqlite:///{_DB}")
    # 构造旧库：只有旧列（无 source_mode / scene_id / scenes 表）
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_cases (id INTEGER PRIMARY KEY, title VARCHAR(200) DEFAULT '',"
            " source_text TEXT NOT NULL, context TEXT, prompt_zh TEXT NOT NULL, prompt_en TEXT,"
            " prompt_en_source VARCHAR(32), prompt_en_translated_at VARCHAR, prompt_en_cache_zh TEXT,"
            " provider VARCHAR(64), model VARCHAR(128), image_count INTEGER DEFAULT 1,"
            " aspect_ratio VARCHAR(16) DEFAULT '1:1', created_by VARCHAR(100), created_at VARCHAR,"
            " updated_at VARCHAR, deleted_at VARCHAR)"))
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_runs (id INTEGER PRIMARY KEY, case_id INTEGER, provider VARCHAR(64),"
            " model VARCHAR(128), status VARCHAR(16), eval_status VARCHAR(16), image_paths TEXT, video_path TEXT,"
            " overall_score INTEGER, grade VARCHAR(16), dimensions TEXT, problems TEXT, optimization_points TEXT,"
            " error TEXT, created_by VARCHAR(100), created_at VARCHAR, completed_at VARCHAR)"))
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "INSERT INTO prompt_eval_cases (id, source_text, prompt_zh) VALUES (1, '旧数据', '旧提示词')"))

    from sqlalchemy.ext.asyncio import AsyncSession
    async with AsyncSession(engine) as db:
        await ensure_prompt_eval_scene_columns(db)

    async with engine.connect() as conn:
        case_cols = {r[1] for r in (await conn.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        run_cols = {r[1] for r in (await conn.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
        assert "source_mode" in case_cols
        assert "scene_id" in run_cols
        row = (await conn.execute(sa.text("SELECT source_mode FROM prompt_eval_cases WHERE id=1"))).first()
        assert row[0] == "manual"

    # 幂等：重复执行不报错
    from sqlalchemy.ext.asyncio import AsyncSession as AS2
    async with AS2(engine) as db:
        await ensure_prompt_eval_scene_columns(db)

    await engine.dispose()
    if os.path.exists(_DB):
        os.remove(_DB)


@pytest.mark.asyncio
async def test_migration_adds_provider_default_column():
    """存量库（无 is_default 列）幂等补列且数据保留；表不存在分支无副作用。"""
    from services.prompt_eval_migration import ensure_provider_default_column
    if os.path.exists(_DB):  # 防测试顺序残留（同文件复用）
        os.remove(_DB)
    engine = create_async_engine(f"sqlite+aiosqlite:///{_DB}")
    # 表不存在 → 直接返回不报错
    from sqlalchemy.ext.asyncio import AsyncSession as AS0
    async with AS0(engine) as db:
        await ensure_provider_default_column(db)
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_provider_keys (id INTEGER PRIMARY KEY, provider VARCHAR(64),"
            " model VARCHAR(128), key_enc TEXT NOT NULL, base_url VARCHAR(255) DEFAULT '',"
            " enabled INTEGER DEFAULT 1, created_at VARCHAR, updated_at VARCHAR, updated_by VARCHAR(100))"))
        await conn.execute(sa.text(
            "INSERT INTO prompt_eval_provider_keys (id, provider, model, key_enc)"
            " VALUES (1, 'minimax-llm', 'MiniMax-M2.7', 'enc-keep')"))
    from sqlalchemy.ext.asyncio import AsyncSession as AS3
    async with AS3(engine) as db:
        await ensure_provider_default_column(db)
        await ensure_provider_default_column(db)  # 幂等：重复执行不报错
    async with engine.connect() as conn:
        cols = {r[1] for r in (await conn.execute(sa.text("PRAGMA table_info(prompt_eval_provider_keys)"))).fetchall()}
        assert "is_default" in cols
        row = (await conn.execute(sa.text(
            "SELECT provider, is_default, key_enc FROM prompt_eval_provider_keys WHERE id=1"))).first()
        # 回填：补列后每组最新启用密钥自动成为默认（W1-复审回归）
        assert row[0] == "minimax-llm" and row[1] == 1 and row[2] == "enc-keep"
    await engine.dispose()
    if os.path.exists(_DB):
        os.remove(_DB)


@pytest.mark.asyncio
async def test_migration_backfills_provider_default_per_group():
    """迁移回填：分组内 provider 优先级 + 每 provider 最新启用键置默认；未分组不占默认位；
    列已存在时二次执行不动默认。"""
    from services.prompt_eval_migration import ensure_provider_default_column
    if os.path.exists(_DB):  # 防测试顺序残留（同文件复用）
        os.remove(_DB)
    engine = create_async_engine(f"sqlite+aiosqlite:///{_DB}")
    async with engine.begin() as conn:
        await conn.execute(sa.text(
            "CREATE TABLE prompt_eval_provider_keys (id INTEGER PRIMARY KEY, provider VARCHAR(64),"
            " model VARCHAR(128), key_enc TEXT NOT NULL, base_url VARCHAR(255) DEFAULT '',"
            " enabled INTEGER DEFAULT 1, created_at VARCHAR, updated_at VARCHAR, updated_by VARCHAR(100))"))
        rows = [
            # llm 分组：updated_at 相同 → id DESC tiebreak 选 id2（每 provider 最新启用键）
            (1, "minimax-llm", "old", "enc-1", 1, "2026-01-02T00:00:00"),
            (2, "minimax-llm", "new", "enc-2", 1, "2026-01-02T00:00:00"),
            # 视觉分组：minimax-vision 启用 → provider 优先级（即使 opencode 更新也非默认，W1 翻转回归）
            (3, "minimax-vision", "v1", "enc-3", 1, "2026-01-03T00:00:00"),
            (4, "opencode-go-vision", "v2", "enc-4", 1, "2026-01-04T00:00:00"),
            # 生图分组：minimax-image 无启用键 → flux 取最新
            (5, "flux", "flux-dev", "enc-5", 1, "2026-01-05T00:00:00"),
            # 未分组：不得默认
            (6, "custom-unknown", "m1", "enc-6", 1, "2026-01-06T00:00:00"),
        ]
        for r in rows:
            await conn.execute(sa.text(
                "INSERT INTO prompt_eval_provider_keys (id, provider, model, key_enc, enabled, updated_at)"
                " VALUES (:id, :provider, :model, :key_enc, :enabled, :updated_at)"),
                {"id": r[0], "provider": r[1], "model": r[2], "key_enc": r[3], "enabled": r[4],
                 "updated_at": r[5]})
    from sqlalchemy.ext.asyncio import AsyncSession as AS4
    async with AS4(engine) as db:
        await ensure_provider_default_column(db)
    async with engine.connect() as conn:
        defaults = dict((await conn.execute(sa.text(
            "SELECT id, is_default FROM prompt_eval_provider_keys"))).all())
        assert defaults[2] == 1  # llm：updated_at 相同 → id DESC tiebreak 选 id2
        assert defaults[1] == 0
        assert defaults[3] == 1  # vision：minimax-vision provider 优先级
        assert defaults[4] == 0  # opencode 更新也非默认（W1 跨 provider 翻转回归）
        assert defaults[5] == 1  # image：flux（minimax-image 无启用键）
        assert defaults[6] == 0  # 未分组
    # 幂等 + 不覆盖：列已存在时（用户改过默认后重启）二次执行保持用户设置
    async with engine.begin() as conn:
        await conn.execute(sa.text("UPDATE prompt_eval_provider_keys SET is_default=0 WHERE id=2"))
        await conn.execute(sa.text("UPDATE prompt_eval_provider_keys SET is_default=1 WHERE id=1"))
    from sqlalchemy.ext.asyncio import AsyncSession as AS5
    async with AS5(engine) as db:
        await ensure_provider_default_column(db)
    async with engine.connect() as conn:
        defaults = dict((await conn.execute(sa.text(
            "SELECT id, is_default FROM prompt_eval_provider_keys"))).all())
        assert defaults[1] == 1 and defaults[2] == 0  # 用户设置保留
    await engine.dispose()
    if os.path.exists(_DB):
        os.remove(_DB)
