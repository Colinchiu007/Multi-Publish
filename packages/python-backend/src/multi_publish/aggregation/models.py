"""Pydantic models for aggregation API."""

from __future__ import annotations

from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator


# Supported source types (Phase 1: headless-only sources)
SUPPORTED_SOURCE_TYPES = {
    "url",      # URL 正文提取 (trafilatura)
    "rss",      # RSS feed
    "sitemap",  # Sitemap
    "api",      # Custom API
}

# Source types requiring Playwright (Phase 1 deferred)
PLAYWRIGHT_SOURCE_TYPES = {
    "youtube", "tiktok", "douyin", "xiaohongshu", "wechat",
    "twitter", "douyin_hot", "weibo_hot", "wangyi",
}

# Rewrite styles (from content-aggregator v2 rewrite.py)
REWRITE_STYLES = {
    "轻松易懂", "正式严谨", "吸引眼球", "深度分析", "认知锚点",
}

# Rewrite strategies (from content-aggregator v1)
REWRITE_STRATEGIES = {
    "summarize", "style_transfer", "paraphrase", "rewrite", "expand", "short_video",
}


class CollectRequest(BaseModel):
    """单篇采集请求"""
    url: str = Field(..., description="目标 URL")
    source_type: str = Field(default="url", description="采集源类型")
    rewrite: bool = Field(default=False, description="是否同时改写")
    strategy: Optional[str] = Field(default=None, description="改写策略")
    seo: bool = Field(default=False, description="是否 SEO 优化")

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid = SUPPORTED_SOURCE_TYPES | PLAYWRIGHT_SOURCE_TYPES
        if v not in valid:
            raise ValueError(f"不支持的 source_type: {v}，支持: {', '.join(sorted(valid))}")
        if v in PLAYWRIGHT_SOURCE_TYPES:
            raise ValueError(
                f"source_type '{v}' 需要 Playwright 浏览器支持，Phase 1 暂不支持。"
                f"支持的无头源: {', '.join(sorted(SUPPORTED_SOURCE_TYPES))}"
            )
        return v

    @field_validator("strategy")
    @classmethod
    def validate_strategy(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in REWRITE_STRATEGIES:
            raise ValueError(f"不支持的 strategy: {v}，支持: {', '.join(sorted(REWRITE_STRATEGIES))}")
        return v


class BatchCollectRequest(BaseModel):
    """批量采集请求"""
    source_type: str = Field(..., description="采集源类型")
    rewrite: bool = Field(default=True, description="是否改写")
    strategy: Optional[str] = Field(default=None, description="改写策略")
    limit: Optional[int] = Field(default=20, ge=1, le=100, description="每源最大采集数")

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid = SUPPORTED_SOURCE_TYPES | PLAYWRIGHT_SOURCE_TYPES
        if v not in valid:
            raise ValueError(f"不支持的 source_type: {v}")
        if v in PLAYWRIGHT_SOURCE_TYPES:
            raise ValueError(
                f"source_type '{v}' 需要 Playwright 浏览器支持，Phase 1 暂不支持。"
            )
        return v


class CollectResult(BaseModel):
    """采集结果"""
    title: str = ""
    content: str = ""
    original_title: str = ""
    source_url: str = ""
    author: str = ""
    word_count: int = 0
    summary: str = ""
    tags: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class RewriteRequest(BaseModel):
    """改写请求"""
    content: str = Field(..., min_length=1, description="待改写内容")
    style: str = Field(default="轻松易懂", description="改写风格")
    length: str = Field(default="keep", description="长度控制: keep/compress/expand")
    seo_optimize: bool = Field(default=False, description="SEO 优化")

    @field_validator("style")
    @classmethod
    def validate_style(cls, v: str) -> str:
        if v not in REWRITE_STYLES:
            raise ValueError(f"不支持的 style: {v}，支持: {', '.join(sorted(REWRITE_STYLES))}")
        return v

    @field_validator("length")
    @classmethod
    def validate_length(cls, v: str) -> str:
        if v not in {"keep", "compress", "expand"}:
            raise ValueError(f"不支持的 length: {v}，支持: keep, compress, expand")
        return v


class RewriteResult(BaseModel):
    """改写结果"""
    result_content: str = ""
    word_count: int = 0
    style: str = ""
    length: str = ""


class SourceInfo(BaseModel):
    """采集源信息"""
    type: str
    name: str
    description: str
    requires_auth: bool = False
    phase1_available: bool = True


class TaskStatus(BaseModel):
    """采集任务状态"""
    task_id: str
    status: str = "pending"  # pending / running / completed / failed / cancelled
    progress: int = 0
    total_items: int = 0
    processed_items: int = 0
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
