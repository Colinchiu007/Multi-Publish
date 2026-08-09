"""Config CRUD service."""
import datetime
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import ConfigItem, ConfigAuditLog, Project

logger = logging.getLogger(__name__)


async def get_project(session: AsyncSession, code: str) -> Project | None:
    result = await session.execute(select(Project).where(Project.code == code))
    return result.scalar_one_or_none()


async def get_all_projects(session: AsyncSession) -> list[Project]:
    result = await session.execute(select(Project).order_by(Project.code))
    return list(result.scalars().all())


async def get_config(session: AsyncSession, config_id: str) -> ConfigItem | None:
    result = await session.execute(select(ConfigItem).where(ConfigItem.id == config_id))
    return result.scalar_one_or_none()


async def get_configs_by_project(session: AsyncSession, project_code: str, category: str | None = None) -> list[ConfigItem]:
    stmt = select(ConfigItem).where(ConfigItem.project_code == project_code)
    if category:
        stmt = stmt.where(ConfigItem.category == category)
    stmt = stmt.order_by(ConfigItem.key)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_configs_by_category(session: AsyncSession, category: str) -> list[ConfigItem]:
    result = await session.execute(
        select(ConfigItem).where(ConfigItem.category == category).order_by(ConfigItem.project_code, ConfigItem.key)
    )
    return list(result.scalars().all())


async def upsert_config(
    session: AsyncSession,
    config_id: str,
    project_code: str,
    category: str,
    key: str,
    value: str,
    value_type: str = "string",
    description: str = "",
    is_secret: int = 0,
    is_required: int = 0,
    default_value: str = "",
    updated_by: str = "",
) -> ConfigItem:
    """Create or update a config item. Returns the item."""
    existing = await get_config(session, config_id)
    now = datetime.datetime.utcnow().isoformat()

    if existing:
        old_value = existing.value
        existing.value = value
        existing.updated_at = now
        existing.updated_by = updated_by
        change_type = "update"
        item = existing
    else:
        item = ConfigItem(
            id=config_id,
            project_code=project_code,
            category=category,
            key=key,
            value=value,
            value_type=value_type,
            description=description,
            is_secret=is_secret,
            is_required=is_required,
            default_value=default_value,
            created_at=now,
            updated_at=now,
            updated_by=updated_by,
        )
        session.add(item)
        old_value = ""
        change_type = "create"

    # Audit log
    audit = ConfigAuditLog(
        config_id=config_id,
        old_value=old_value,
        new_value=value,
        changed_by=updated_by,
        changed_at=now,
        change_type=change_type,
    )
    session.add(audit)
    await session.commit()
    await session.refresh(item)
    return item


async def get_audit_logs(
    session: AsyncSession,
    config_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ConfigAuditLog]:
    stmt = select(ConfigAuditLog).order_by(ConfigAuditLog.changed_at.desc())
    if config_id:
        stmt = stmt.where(ConfigAuditLog.config_id == config_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())
