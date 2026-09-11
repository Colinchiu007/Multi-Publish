"""FastAPI router for aggregation endpoints."""

from __future__ import annotations

import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException

from .models import (
    CollectRequest,
    CollectResult,
    CollectVideoRequest,
    BatchCollectRequest,
    RewriteRequest,
    RewriteResult,
    SourceInfo,
    TaskStatus,
)
from .service import AggregationService
from .video_service import VideoCollectError, VideoCollectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aggregation", tags=["aggregation"])

_service: AggregationService | None = None
_video_service: VideoCollectService | None = None


def _get_service() -> AggregationService:
    global _service
    if _service is None:
        _service = AggregationService()
    return _service


def _get_video_service() -> VideoCollectService:
    global _video_service
    if _video_service is None:
        _video_service = VideoCollectService()
    return _video_service


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


@router.post("/collect-video", response_model=CollectResult)
async def collect_video(request: CollectVideoRequest):
    """视频作品采集（抖音/小红书）：下载 → 提音频 → ASR 转写。"""
    try:
        service = _get_video_service()
        return await asyncio.to_thread(service.collect_video, request)
    except VideoCollectError as e:
        # code: -6 ASR引擎不可用 / -7 转写超时 / -8 无音轨 / VIDEOCLONE_* 下载错误
        logger.warning(f"[aggregation] collect_video failed: code={e.code}, {e.message}")
        raise HTTPException(status_code=422, detail=f"{e.code}: {e.message}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[aggregation] collect_video failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"视频采集失败: {e}")


@router.post("/rewrite", response_model=RewriteResult)
async def rewrite(request: RewriteRequest):
    try:
        service = _get_service()
        return await service.rewrite(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[aggregation] rewrite failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
