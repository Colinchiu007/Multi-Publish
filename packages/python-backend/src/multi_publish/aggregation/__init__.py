"""
热文采集模块 — 封装 content-aggregator 的采集和改写能力。

提供统一的异步接口，与 Multi-Publish 的 TaskQueue、ProgressReporter 集成。
Phase 1: 包依赖集成，通过 content-aggregator 的 ContentPipeline 和 get_collector 实现。
"""

from multi_publish.aggregation.models import (
    TaskStatus,
    CollectRequest,
    CollectResult,
    RewriteRequest,
    RewriteResult,
    SourceInfo,
)
from multi_publish.aggregation.service import AggregationService
from multi_publish.aggregation.router import router

__all__ = [
    "AggregationService",
    "CollectRequest",
    "CollectResult",
    "RewriteRequest",
    "RewriteResult",
    "SourceInfo",
    "TaskStatus",
    "router",
]
