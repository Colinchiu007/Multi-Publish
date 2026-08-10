"""Configuration snapshot service — save, list, diff, restore."""
import json
import datetime
import logging
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import ConfigItem, ConfigAuditLog
from database import Base

logger = logging.getLogger(__name__)


async def create_snapshot(db: AsyncSession, label: str = "", created_by: str = "") -> dict:
    """Save current state of all config_items as a snapshot."""
    now = datetime.datetime.utcnow().isoformat()
    result = await db.execute(select(ConfigItem).order_by(ConfigItem.id))
    items = result.scalars().all()

    snapshot_data = {
        "label": label,
        "created_at": now,
        "created_by": created_by,
        "items": {},
    }
    for item in items:
        snapshot_data["items"][item.id] = {
            "project_code": item.project_code,
            "category": item.category,
            "key": item.key,
            "value": item.value,
            "value_type": item.value_type,
            "description": item.description,
            "is_secret": item.is_secret,
            "is_required": item.is_required,
            "default_value": item.default_value,
        }

    snapshot_json = json.dumps(snapshot_data, ensure_ascii=False, indent=2)

    # Store in a simple key-value table via raw SQL
    snapshot_id = f"snapshot_{now.replace(':', '-').replace('.', '-')}"
    await db.execute(
        text("INSERT OR REPLACE INTO config_audit_log (id, config_id, old_value, new_value, changed_by, changed_at, change_type, source_ip) VALUES (NULL, :cid, '', :val, :by, :at, 'snapshot', '')"),
        {"cid": snapshot_id, "val": snapshot_json, "by": created_by, "at": now}
    )
    await db.commit()

    logger.info(f"Created snapshot: {snapshot_id} ({len(snapshot_data['items'])} items)")
    return {"id": snapshot_id, "label": label, "item_count": len(items), "created_at": now}


async def list_snapshots(db: AsyncSession) -> list[dict]:
    """List all snapshots."""
    result = await db.execute(
        text("SELECT config_id, changed_at, changed_by, new_value FROM config_audit_log WHERE change_type = 'snapshot' AND config_id LIKE 'snapshot_%' ORDER BY changed_at DESC LIMIT 50")
    )
    snapshots = []
    for row in result:
        try:
            data = json.loads(row[3])
            snapshots.append({
                "id": row[0],
                "label": data.get("label", ""),
                "item_count": len(data.get("items", {})),
                "created_at": row[1],
                "created_by": row[2],
            })
        except (json.JSONDecodeError, TypeError):
            snapshots.append({"id": row[0], "label": "(corrupted)", "item_count": 0, "created_at": row[1], "created_by": row[2]})
    return snapshots


async def get_snapshot(db: AsyncSession, snapshot_id: str) -> dict | None:
    """Get a snapshot's full data."""
    result = await db.execute(
        text("SELECT new_value FROM config_audit_log WHERE config_id = :cid AND change_type = 'snapshot'"),
        {"cid": snapshot_id}
    )
    row = result.fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except (json.JSONDecodeError, TypeError):
        return None


async def diff_snapshots(db: AsyncSession, id_a: str, id_b: str) -> dict:
    """Diff two snapshots. Returns added, removed, changed items."""
    snap_a = await get_snapshot(db, id_a)
    snap_b = await get_snapshot(db, id_b)
    if not snap_a or not snap_b:
        return {"error": "Snapshot not found"}

    items_a = snap_a.get("items", {})
    items_b = snap_b.get("items", {})

    added = [k for k in items_b if k not in items_a]
    removed = [k for k in items_a if k not in items_b]
    changed = []
    for k in items_a:
        if k in items_b and items_a[k].get("value") != items_b[k].get("value"):
            changed.append({
                "id": k,
                "old_value": items_a[k].get("value"),
                "new_value": items_b[k].get("value"),
            })

    return {
        "snapshot_a": id_a,
        "snapshot_b": id_b,
        "added": len(added),
        "removed": len(removed),
        "changed": len(changed),
        "added_ids": added,
        "removed_ids": removed,
        "changed_items": changed,
    }


async def restore_snapshot(db: AsyncSession, snapshot_id: str, restored_by: str = "") -> dict:
    """Restore all config_items from a snapshot."""
    snap = await get_snapshot(db, snapshot_id)
    if not snap:
        return {"error": "Snapshot not found"}

    items = snap.get("items", {})
    restored = 0
    now = datetime.datetime.utcnow().isoformat()

    for config_id, data in items.items():
        # Upsert each item
        existing = await db.execute(select(ConfigItem).where(ConfigItem.id == config_id))
        item = existing.scalar_one_or_none()
        old_value = item.value if item else ""
        if item:
            item.value = data["value"]
            item.updated_at = now
        else:
            item = ConfigItem(
                id=config_id,
                project_code=data["project_code"],
                category=data["category"],
                key=data["key"],
                value=data["value"],
                value_type=data.get("value_type", "string"),
                description=data.get("description", ""),
                is_secret=data.get("is_secret", 0),
                is_required=data.get("is_required", 0),
                default_value=data.get("default_value", ""),
                created_at=now,
                updated_at=now,
            )
            db.add(item)

        # Audit log
        audit = ConfigAuditLog(
            config_id=config_id,
            old_value=old_value,
            new_value=data["value"],
            changed_by=restored_by,
            changed_at=now,
            change_type="restore",
        )
        db.add(audit)
        restored += 1

    await db.commit()
    logger.info(f"Restored {restored} items from snapshot {snapshot_id}")
    return {"restored": restored, "snapshot_id": snapshot_id}
