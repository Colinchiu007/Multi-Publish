"""AggregationService — 封装 content-aggregator 的采集和改写能力。

Phase 1: 直接调用 content-aggregator 的 ContentPipeline、get_collector 和 rewrite 模块。
"""

from __future__ import annotations

import logging

import importlib as _importlib

def _lazy_import(module_path: str, attr: str = None):
    """Lazy import with graceful degradation for optional dependencies."""
    try:
        mod = _importlib.import_module(module_path)
        if attr:
            return getattr(mod, attr)
        return mod
    except ImportError:
        return None


from typing import Optional

from .models import (
    TaskStatus,
    CollectRequest,
    CollectResult,
    BatchCollectRequest,
    RewriteRequest,
    RewriteResult as RewriteResultModel,
    SourceInfo,
    SUPPORTED_SOURCE_TYPES,
    PLAYWRIGHT_SOURCE_TYPES,
)

logger = logging.getLogger(__name__)


class AggregationService:
    """热文采集和改写服务。

    封装 content-aggregator v1 引擎的能力：
    - 单篇 URL 采集（ContentPipeline.process_url）
    - 批量源采集（ContentPipeline.process_all_sources）
    - LLM 改写（rewrite_content）
    """

    def __init__(self, config: dict | None = None):
        self._config = config or {}

    async def collect(self, request: CollectRequest) -> CollectResult:
        logger.info(f"[AggregationService] collect: url={request.url}, type={request.source_type}")
        if request.source_type == "url":
            return await self._collect_url(request)
        elif request.source_type == "rss":
            return await self._collect_rss(request)
        elif request.source_type in ("sitemap", "api"):
            return await self._collect_via_pipeline(request)
        else:
            raise ValueError(f"Phase 1 不支持的 source_type: {request.source_type}")

    async def _collect_url(self, request: CollectRequest) -> CollectResult:
        collect_url = _lazy_import("content_aggregator.backend.app.services.collect", "collect_url")
        if collect_url is None:
            raise ImportError("content-aggregator 未安装。请运行: pip install content-aggregator")
        result = await collect_url(str(request.url))
        return CollectResult(
            title=result.title,
            content=result.content,
            source_url=result.source_url,
            author=result.author or "",
            word_count=result.word_count,
        )

    async def _collect_rss(self, request: CollectRequest) -> CollectResult:
        ContentPipeline = _lazy_import("content_aggregator.workflows.pipeline", "ContentPipeline")
        config = self._build_pipeline_config()
        if ContentPipeline is None:
            raise ImportError("content-aggregator 未安装")
        async with ContentPipeline(config) as pipeline:
            articles = await pipeline.process_url(
                url=str(request.url),
                rewrite=request.rewrite,
                strategy=request.strategy,
                seo=request.seo,
                limit=1,
            )
        if not articles:
            raise ValueError(f"RSS 采集无结果: {request.url}")
        article = articles[0]
        return CollectResult(
            title=article.title,
            content=article.content,
            original_title=article.original_title,
            source_url=article.source_url,
            author=article.author,
            word_count=article.word_count,
            summary=article.summary,
            tags=article.tags,
            metadata=article.metadata,
        )

    async def _collect_via_pipeline(self, request: CollectRequest) -> CollectResult:
        get_collector = _lazy_import("content_aggregator.sources", "get_collector")
        source_config = {"url": str(request.url), "name": request.source_type}
        if get_collector is None:
            raise ImportError("content-aggregator 未安装")
        collector = get_collector(request.source_type, config=source_config)
        result = await collector.collect()
        if not result.data:
            raise ValueError(f"{request.source_type} 采集无结果: {request.url}")
        item = result.data[0]
        content_str = item.get("content", "") or item.get("summary", "") or ""
        title_str = item.get("title", "") or ""
        return CollectResult(
            title=title_str,
            content=content_str,
            source_url=item.get("url", str(request.url)),
            author=item.get("author", ""),
            word_count=len(content_str),
            summary=item.get("summary", ""),
            metadata=item.get("metadata", {}),
        )

    async def collect_batch(self, request: BatchCollectRequest) -> list[CollectResult]:
        logger.info(f"[AggregationService] collect_batch: type={request.source_type}")
        ContentPipeline = _lazy_import("content_aggregator.workflows.pipeline", "ContentPipeline")
        config = self._build_pipeline_config()
        if ContentPipeline is None:
            raise ImportError("content-aggregator 未安装")
        if ContentPipeline is None:
            raise ImportError("content-aggregator 未安装")
        async with ContentPipeline(config) as pipeline:
            result = await pipeline.process_all_sources(
                rewrite=request.rewrite,
                limit_per_source=request.limit,
            )
        articles = result.get("articles", [])
        return [
            CollectResult(
                title=a.title,
                content=a.content,
                original_title=a.original_title,
                source_url=a.source_url,
                author=a.author,
                word_count=a.word_count,
                summary=a.summary,
                tags=a.tags,
                metadata=a.metadata,
            )
            for a in articles
        ]

    async def rewrite(self, request: RewriteRequest) -> RewriteResultModel:
        logger.info(f"[AggregationService] rewrite: style={request.style}, length={request.length}")
        rewrite_content = _lazy_import("content_aggregator.backend.app.services.rewrite", "rewrite_content")
        if rewrite_content is None:
            raise ImportError("content-aggregator 未安装")
        result = await rewrite_content(
            content=request.content,
            style=request.style,
            length=request.length,
            seo_optimize=request.seo_optimize,
        )
        return RewriteResultModel(
            result_content=result.result_content,
            word_count=result.word_count,
            style=result.style,
            length=result.length,
        )

    def get_available_sources(self) -> list[SourceInfo]:
        sources = [
            SourceInfo(type="url", name="URL 正文提取", description="输入任意 URL，自动提取正文内容（基于 trafilatura）", requires_auth=False, phase1_available=True),
            SourceInfo(type="rss", name="RSS 订阅源", description="输入 RSS 地址，采集订阅源中的文章", requires_auth=False, phase1_available=True),
            SourceInfo(type="sitemap", name="Sitemap", description="从网站 Sitemap 中提取文章列表", requires_auth=False, phase1_available=True),
            SourceInfo(type="api", name="自定义 API", description="从自定义 API 端点采集内容", requires_auth=False, phase1_available=True),
        ]
        phase2 = [
            ("youtube", "YouTube", "YouTube 视频字幕提取（需要 API Key）"),
            ("douyin", "抖音", "抖音视频采集（需要 Cookie）"),
            ("xiaohongshu", "小红书", "小红书笔记采集（需要 Cookie）"),
            ("wechat", "微信公众号", "微信公众号文章采集（需要 API Key）"),
            ("weibo_hot", "微博热点", "微博热榜采集（免登录）"),
            ("wangyi", "网易新闻", "网易新闻频道采集（免登录）"),
            ("twitter", "Twitter/X", "Twitter 推文采集（需要 Bearer Token）"),
            ("tiktok", "TikTok", "TikTok 视频采集（需要 Session Cookie）"),
        ]
        for st, nm, ds in phase2:
            sources.append(SourceInfo(type=st, name=nm, description=ds, requires_auth=True, phase1_available=False))
        return sources

    def get_task_status(self, task_id: str) -> TaskStatus | None:
        """获取采集任务状态。

        Phase 1: 返回占位状态（后续接入 TaskQueue 后替换）。
        """
        from datetime import datetime
        return TaskStatus(
            task_id=task_id,
            status="completed",
            progress=100,
            total_items=0,
            processed_items=0,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )

    def _build_pipeline_config(self) -> dict:
        import os
        return {
            "llm": {
                "api_key": os.environ.get("PO_OPENAI_API_KEY", ""),
                "model": os.environ.get("PO_OPENAI_MODEL", "gpt-4o-mini"),
                "base_url": os.environ.get("PO_OPENAI_BASE_URL", "https://api.openai.com/v1"),
            },
            "export": {"output_dir": "./output/aggregation"},
            "http": {
                "timeout": 30,
                "proxy": os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY"),
            },
            "filter": {
                "sensitive": {"enabled": True, "strict_mode": False},
                "dedup": {"enabled": True, "similarity_threshold": 0.8},
            },
            "sources": {},
        }
