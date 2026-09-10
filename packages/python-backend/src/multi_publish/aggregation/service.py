"""AggregationService — 热文采集和改写服务。

Phase 2: 改写已切换至 content-aggregator-shared（shared 库），
通过 LLMServiceAdapter 注入 Multi-Publish 的 LLMService，
消除两套 LLM 调用逻辑并存。
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

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

# style→strategy 映射（中文风格名 → v1 RewriteStrategy）
_STYLE_TO_STRATEGY = {
    "轻松易懂": "paraphrase",
    "正式严谨": "style_transfer",
    "吸引眼球": "short_video",
    "深度分析": "expand",
    "认知锚点": "rewrite",
}

# length→字数范围映射
_LENGTH_RANGES = {
    "keep": (300, 3000, 1500),
    "compress": (100, 800, 400),
    "expand": (800, 5000, 2500),
}


class AggregationService:
    """热文采集和改写服务。

    封装 content-aggregator v1 引擎的能力：
    - 单篇 URL 采集（ContentPipeline.process_url）
    - 批量源采集（ContentPipeline.process_all_sources）
    - LLM 改写（shared 库 RewriteProcessor + LLMServiceAdapter）
    """

    def __init__(self, config: dict | None = None):
        self._config = config or {}
        # P1: 内存任务追踪器（task_id → 状态）
        self._tasks: dict[str, dict] = {}

    # ── 采集 ──────────────────────────────────────────────────────────

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
        logger.info(f"[AggregationService] _collect_url: url={request.url}")
        url = str(request.url).strip()
        if not url:
            raise ValueError("URL 不能为空")
        # 使用 trafilatura 直接做正文提取（原 pipeline.process_url 对所有 URL 走 RSS 路径导致普通网页提取失败）
        import asyncio
        from urllib.parse import urlparse
        trafilatura = _lazy_import("trafilatura")
        if trafilatura is None:
            raise ImportError("trafilatura 未安装。请运行: pip install trafilatura")
        try:
            html = await asyncio.to_thread(trafilatura.fetch_url, url)
        except Exception as fetch_err:
            raise ValueError(f"URL 无法访问: {fetch_err}") from fetch_err
        if not html:
            raise ValueError(f"URL 无法访问: {url}")
        text = await asyncio.to_thread(
            trafilatura.extract,
            html,
            include_links=False,
            include_images=False,
            include_tables=False,
        )
        if not text:
            raise ValueError(f"URL 采集无结果: {url}")
        metadata = trafilatura.extract_metadata(html)
        title = ""
        if metadata and metadata.title:
            title = str(metadata.title).strip()
        if not title:
            parsed = urlparse(url)
            title = parsed.netloc or parsed.path or url
        return CollectResult(
            title=title,
            content=text.strip(),
            source_url=url,
            author=str(metadata.author).strip() if metadata and metadata.author else "",
            word_count=len(text.strip()),
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
            word_count=article.word_count or len(article.content or ""),
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

    # ── 改写（P1: 使用 shared 库 + LLMServiceAdapter） ─────────────

    async def rewrite(self, request: RewriteRequest) -> RewriteResultModel:
        logger.info(f"[AggregationService] rewrite: style={request.style}, length={request.length}")
        # 输入校验：内容过短（<20 字）优先报错，与 RewriteProcessor 的校验保持一致
        if len((request.content or "").strip()) < 20:
            raise ValueError(f"输入内容过短（仅 {len((request.content or '').strip())} 字符），请提供至少 20 字的完整文章")
        # 前置校验：未配置 LLM API Key 时给出友好中文提示，避免底层抛英文错误
        api_key = os.environ.get("LLM_API_KEY") or os.environ.get("PO_OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("未配置 LLM API Key，请在环境变量中设置 LLM_API_KEY 或 PO_OPENAI_API_KEY 后再改写")
        # 从 shared 库导入（替代旧 content_aggregator.xxx 路径）
        RewriteProcessor = _lazy_import("content_aggregator_shared.shared.rewriters.rewriter", "RewriteProcessor")
        RewriteConfig = _lazy_import("content_aggregator_shared.shared.rewriters.rewriter", "RewriteConfig")
        RewriteStrategy = _lazy_import("content_aggregator_shared.shared.rewriters.rewriter", "RewriteStrategy")
        Content = _lazy_import("content_aggregator_shared.shared.models", "Content")

        if RewriteProcessor is None or RewriteConfig is None or Content is None:
            raise ImportError("content-aggregator-shared 未安装。请运行: pip install content-aggregator-shared")

        # P1: 使用 LLMServiceAdapter 注入 Multi-Publish 的 LLMService
        llm_client = self._build_llm_adapter()

        config = self._build_pipeline_config()
        config["_llm_client"] = llm_client

        content_obj = Content(
            id="",
            source_id="",
            title="",
            content=request.content,
            source_type="manual",
            url="",
        )
        strategy_name = _STYLE_TO_STRATEGY.get(request.style, "rewrite")
        min_wc, max_wc, target_wc = _LENGTH_RANGES.get(request.length, (300, 3000, 1500))
        rewrite_cfg = RewriteConfig(
            strategy=RewriteStrategy(strategy_name),
            min_word_count=min_wc,
            max_word_count=max_wc,
            target_word_count=target_wc,
        )
        async with RewriteProcessor(config) as proc:
            result = await proc.rewrite(content_obj, rewrite_cfg)
        if not result.success:
            raise ValueError(result.error or "未知错误")
        result_model = RewriteResultModel(
            result_content=result.rewritten_content,
            word_count=len(result.rewritten_content),
            style=request.style,
            length=request.length,
            platform=request.platform,
        )
        try:
            from .quality import ContentQualityEvaluator
            evaluator = ContentQualityEvaluator()
            report = evaluator.evaluate(
                result.rewritten_content,
                original_content=request.content,
                platform=request.platform,
            )
            from .quality import serialize_quality_report

            result_model.quality_report = serialize_quality_report(report)
        except Exception as e:
            logger.warning(f"[AggregationService] quality evaluation failed: {e}")
        return result_model

    def _build_llm_adapter(self):
        """构造 LLMServiceAdapter，将 Multi-Publish LLMService 注入改写器。

        优先级：LLM_API_KEY > PO_OPENAI_API_KEY（向下兼容）
        无 API key 时返回 None，让 RewriteProcessor 使用默认 LLMClient。
        """
        LLMService = _lazy_import("multi_publish.services.llm_service", "LLMService")
        LLMServiceAdapter = _lazy_import("content_aggregator_shared.shared.clients.llm_service_adapter", "LLMServiceAdapter")

        if LLMService is None or LLMServiceAdapter is None:
            logger.warning("[AggregationService] LLMService 或 LLMServiceAdapter 不可用，"
                           "RewriteProcessor 将使用默认 LLMClient")
            return None

        api_key = os.environ.get("LLM_API_KEY") or os.environ.get("PO_OPENAI_API_KEY", "")
        if not api_key:
            logger.warning("[AggregationService] 未配置 LLM API Key，"
                           "RewriteProcessor 将使用默认 LLMClient")
            return None

        base_url = os.environ.get("LLM_BASE_URL") or os.environ.get("PO_OPENAI_BASE_URL", "")
        model = os.environ.get("LLM_MODEL") or os.environ.get("PO_OPENAI_MODEL", "gpt-4o-mini")

        svc = LLMService(config={"api_key": api_key, "base_url": base_url, "model": model})
        return LLMServiceAdapter(svc)

    # ── 源管理 ────────────────────────────────────────────────────────

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

    # ── 任务状态追踪（P1: 内存任务追踪器，替代占位实现） ────────────

    def get_task_status(self, task_id: str) -> TaskStatus | None:
        """获取采集任务状态。"""
        entry = self._tasks.get(task_id)
        if entry is None:
            return None
        return TaskStatus(
            task_id=task_id,
            status=entry["status"],
            progress=entry.get("progress", 0),
            total_items=entry.get("total_items", 0),
            processed_items=entry.get("processed_items", 0),
            error=entry.get("error"),
            created_at=entry.get("created_at"),
            updated_at=entry.get("updated_at"),
        )

    def _create_task(self, total_items: int = 0) -> str:
        """创建采集任务并返回 task_id。"""
        task_id = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc).isoformat()
        self._tasks[task_id] = {
            "status": "pending",
            "progress": 0,
            "total_items": total_items,
            "processed_items": 0,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        return task_id

    def _update_task(self, task_id: str, **kwargs):
        """更新任务状态。"""
        entry = self._tasks.get(task_id)
        if entry is None:
            return
        entry.update(kwargs)
        entry["updated_at"] = datetime.now(timezone.utc).isoformat()

    # ── 配置 ──────────────────────────────────────────────────────────

    def _build_pipeline_config(self) -> dict:
        """构建 ContentPipeline 配置。

        LLM 配置优先使用 Multi-Publish 标准环境变量 (LLM_API_KEY 等)，
        向下兼容 PO_OPENAI_*（旧 content-aggregator 约定）。
        """
        return {
            "llm": {
                "api_key": os.environ.get("LLM_API_KEY") or os.environ.get("PO_OPENAI_API_KEY", ""),
                "model": os.environ.get("LLM_MODEL") or os.environ.get("PO_OPENAI_MODEL", "gpt-4o-mini"),
                "base_url": os.environ.get("LLM_BASE_URL") or os.environ.get("PO_OPENAI_BASE_URL", "https://api.openai.com/v1"),
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
