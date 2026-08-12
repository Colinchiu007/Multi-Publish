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
