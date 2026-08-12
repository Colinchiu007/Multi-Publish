"""usage 表迁移：调度健康度列（queued_count/cooldown_count/queue_wait_ms/cooldown_wait_ms），幂等补列。"""
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession


async def ensure_usage_columns(db: AsyncSession):
    cols = {row[1] for row in (await db.execute(sa.text("PRAGMA table_info(model_usage_daily)"))).fetchall()}
    additions = [
        ("queued_count", "INTEGER DEFAULT 0"),
        ("cooldown_count", "INTEGER DEFAULT 0"),
        ("queue_wait_ms", "INTEGER DEFAULT 0"),
        ("cooldown_wait_ms", "INTEGER DEFAULT 0"),
    ]
    for name, ddl in additions:
        if name not in cols:
            await db.execute(sa.text(f"ALTER TABLE model_usage_daily ADD COLUMN {name} {ddl}"))
    await db.commit()
