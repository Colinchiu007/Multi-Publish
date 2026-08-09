"""Configuration snapshot API — save, list, diff, restore."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import require_admin, get_current_user
from services import snapshot_service

router = APIRouter(prefix="/api/v1/snapshots", tags=["snapshots"])


@router.get("")
async def list_snapshots(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    snapshots = await snapshot_service.list_snapshots(db)
    return {"snapshots": snapshots}


@router.post("")
async def create_snapshot(body: dict, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    snap = await snapshot_service.create_snapshot(
        db,
        label=body.get("label", ""),
        created_by=user.get("username", "unknown"),
    )
    return snap


@router.get("/{snapshot_id}")
async def get_snapshot_detail(snapshot_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    snap = await snapshot_service.get_snapshot(db, snapshot_id)
    if not snap:
        raise HTTPException(404, f"Snapshot not found: {snapshot_id}")
    return snap


@router.get("/diff")
async def diff_snapshots(id_a: str, id_b: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    diff = await snapshot_service.diff_snapshots(db, id_a, id_b)
    return diff


@router.post("/{snapshot_id}/restore")
async def restore_snapshot(snapshot_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_admin)):
    result = await snapshot_service.restore_snapshot(
        db, snapshot_id,
        restored_by=user.get("username", "unknown"),
    )
    return result
