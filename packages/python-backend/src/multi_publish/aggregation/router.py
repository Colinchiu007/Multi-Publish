"""FastAPI router for aggregation endpoints."""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException

from .models import (
    CollectRequest,
    CollectResult,
    BatchCollectRequest,
    RewriteRequest,
    RewriteResult,
    SourceInfo,
    TaskStatus,
)
from .service import AggregationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aggregation", tags=["aggregation"])

_service: AggregationService | None = None


def _get_service() -> AggregationService:
    global _service
    if _service is None:
        _service = AggregationService()
    return _service


@router.post("/collect", response_model=CollectResult)
async def collect(request: CollectRequest):
    try:
        service = _get_service()
        return await service.collect(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[aggregation] collect failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"采集失败: {e}")


@router.post("/collect/batch", response_model=list[CollectResult])
async def collect_batch(request: BatchCollectRequest):
    try:
        service = _get_service()
        return await service.collect_batch(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[aggregation] collect_batch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"批量采集失败: {e}")


@router.post("/rewrite", response_model=RewriteResult)
async def rewrite(request: RewriteRequest):
    try:
        service = _get_service()
        return await service.rewrite(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[aggregation] rewrite failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"改写失败: {e}")


@router.get("/sources", response_model=list[SourceInfo])
async def get_sources():
    service = _get_service()
    return service.get_available_sources()


@router.get("/tasks/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    service = _get_service()
    status = service.get_task_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    return status
