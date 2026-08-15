"""prompt_eval 场景列迁移：存量库幂等补列（source_mode / scene_id）。

背景：create_all 只建新表、不会给既有表补新列；PR #593 已上线 manual 模式的
prompt_eval_cases / prompt_eval_runs，本次新增 source_mode / scene_id 列必须对存量库
做幂等 ALTER，否则部署后 prompt-eval 模块全线 500（no such column）。
"""
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


async def ensure_prompt_eval_scene_columns(db: AsyncSession) -> None:
    tables = {r[0] for r in (await db.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))).fetchall()}
    if "prompt_eval_cases" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        if "source_mode" not in cols:
            await db.execute(sa.text(
                "ALTER TABLE prompt_eval_cases ADD COLUMN source_mode VARCHAR(16) DEFAULT 'manual'"))
    if "prompt_eval_runs" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
        if "scene_id" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN scene_id INTEGER"))
    await db.commit()


async def ensure_prompt_eval_video_columns(db: AsyncSession) -> None:
    """prompt_eval 视频列迁移：cases.media_type；runs.video_path/video_frames（幂等 ALTER）。"""
    tables = {r[0] for r in (await db.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))).fetchall()}
    if "prompt_eval_cases" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        if "media_type" not in cols:
            await db.execute(sa.text(
                "ALTER TABLE prompt_eval_cases ADD COLUMN media_type VARCHAR(16) DEFAULT 'image' NOT NULL"))
    if "prompt_eval_runs" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
        if "video_path" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN video_path VARCHAR(512)"))
        if "video_frames" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN video_frames TEXT"))
    await db.commit()


async def ensure_prompt_eval_dual_columns(db: AsyncSession) -> None:
    """prompt_eval 双路对比列迁移：cases.compare_mode/engine_params；runs.prompt_variant/
    prompt_source_zh/engine_meta/prompt_zh/prompt_en（幂等 ALTER，存量库零迁移成本）。"""
    tables = {r[0] for r in (await db.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))).fetchall()}
    if "prompt_eval_cases" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_cases)"))).fetchall()}
        if "compare_mode" not in cols:
            await db.execute(sa.text(
                "ALTER TABLE prompt_eval_cases ADD COLUMN compare_mode VARCHAR(16) DEFAULT 'single'"))
        if "engine_params" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_cases ADD COLUMN engine_params TEXT"))
    if "prompt_eval_runs" in tables:
        cols = {r[1] for r in (await db.execute(sa.text("PRAGMA table_info(prompt_eval_runs)"))).fetchall()}
        if "prompt_variant" not in cols:
            await db.execute(sa.text(
                "ALTER TABLE prompt_eval_runs ADD COLUMN prompt_variant VARCHAR(16) DEFAULT 'manual'"))
        if "prompt_source_zh" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN prompt_source_zh TEXT"))
        if "engine_meta" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN engine_meta TEXT"))
        if "prompt_zh" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN prompt_zh TEXT"))
        if "prompt_en" not in cols:
            await db.execute(sa.text("ALTER TABLE prompt_eval_runs ADD COLUMN prompt_en TEXT"))
    await db.commit()
