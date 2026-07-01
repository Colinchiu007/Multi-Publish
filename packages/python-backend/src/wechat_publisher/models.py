"""
WeChat Publisher Models

Data models for WeChat Official Account publisher module.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path


@dataclass
class Article:
    """
    Represents an article to be published to WeChat Official Account.

    Attributes:
        title: Article title (required, max 64 chars)
        content: HTML content (required)
        author: Article author (optional, max 64 chars)
        digest: Article summary (optional, max 64 chars, auto-generated from content if not provided)
        content_source_url: Source URL for "Read original" link (optional)
        thumb_media_id: Media ID of cover image (optional, uploaded via upload_cover)
        thumb_url: URL of cover image (optional, used if thumb_media_id not provided)
        need_open_comment: Whether to open comments (0=no, 1=yes, default 0)
        only_fans_can_comment: Whether only fans can comment (0=no, 1=yes, default 0)
        show_cover_pic: Whether to show cover in text (0=no, 1=yes, default 1)
    """

    title: str
    content: str
    author: Optional[str] = None
    digest: Optional[str] = None
    content_source_url: Optional[str] = None
    thumb_media_id: Optional[str] = None
    thumb_url: Optional[str] = None
    need_open_comment: int = 0
    only_fans_can_comment: int = 0
    show_cover_pic: int = 1

    def __post_init__(self) -> None:
        """Validate article data after initialization."""
        if not self.title:
            raise ValueError("Article title is required")
        if not self.content:
            raise ValueError("Article content is required")

        # Truncate fields to WeChat limits
        if len(self.title) > 64:
            self.title = self.title[:64]

        if self.author and len(self.author) > 64:
            self.author = self.author[:64]

        if self.digest and len(self.digest) > 64:
            self.digest = self.digest[:64]

        # Auto-generate digest from content if not provided
        if not self.digest:
            # Strip HTML tags and take first 64 chars
            import re
            text = re.sub(r'<[^>]+>', '', self.content)
            text = ' '.join(text.split())  # Normalize whitespace
            self.digest = text[:64] if text else "No description"

    def to_api_dict(self) -> Dict[str, Any]:
        """
        Convert article to WeChat API dictionary format.

        Returns:
            Dictionary ready for WeChat API
        """
        article_dict = {
            "title": self.title,
            "content": self.content,
            "need_open_comment": self.need_open_comment,
            "only_fans_can_comment": self.only_fans_can_comment,
            "show_cover_pic": self.show_cover_pic,
        }

        if self.author:
            article_dict["author"] = self.author

        if self.digest:
            article_dict["digest"] = self.digest

        if self.content_source_url:
            article_dict["content_source_url"] = self.content_source_url

        if self.thumb_media_id:
            article_dict["thumb_media_id"] = self.thumb_media_id

        return article_dict


@dataclass
class PublishResult:
    """
    Result of a publish operation.

    Attributes:
        success: Whether the publish was successful
        article_id: WeChat article ID (if successful)
        article_url: URL to published article (if successful)
        media_id: Media ID (if created)
        publish_id: Publish job ID (for checking status)
        error_code: Error code (if failed)
        error_message: Error message (if failed)
        data: Raw response data from WeChat API
        published_at: Timestamp when article was published
    """

    success: bool
    article_id: Optional[str] = None
    article_url: Optional[str] = None
    media_id: Optional[str] = None
    publish_id: Optional[str] = None
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)
    published_at: Optional[datetime] = None

    @classmethod
    def success_result(
        cls,
        article_id: Optional[str] = None,
        article_url: Optional[str] = None,
        media_id: Optional[str] = None,
        publish_id: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> "PublishResult":
        """Create a success result."""
        return cls(
            success=True,
            article_id=article_id,
            article_url=article_url,
            media_id=media_id,
            publish_id=publish_id,
            data=data or {},
            published_at=datetime.now()
        )

    @classmethod
    def error_result(
        cls,
        error_code: int,
        error_message: str,
        data: Optional[Dict[str, Any]] = None
    ) -> "PublishResult":
        """Create an error result."""
        return cls(
            success=False,
            error_code=error_code,
            error_message=error_message,
            data=data or {}
        )

    def __str__(self) -> str:
        if self.success:
            parts = ["✓ Publish successful"]
            if self.article_url:
                parts.append(f"URL: {self.article_url}")
            if self.article_id:
                parts.append(f"ID: {self.article_id}")
            return " | ".join(parts)
        else:
            return f"✗ Publish failed: [{self.error_code}] {self.error_message}"


@dataclass
class Draft:
    """
    Represents a WeChat draft article.

    Attributes:
        media_id: Draft media ID
        content: Draft content (Article object)
        created_at: Draft creation timestamp
        updated_at: Draft last update timestamp
    """

    media_id: str
    content: Article
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_api_response(cls, response_data: Dict[str, Any], content: Article) -> "Draft":
        """Create Draft from WeChat API response."""
        return cls(
            media_id=response_data.get("media_id", ""),
            content=content,
            created_at=datetime.now()
        )


@dataclass
class PublishStatus:
    """
    Status of a publish operation.

    Attributes:
        publish_id: Publish job ID
        status: Publish status (0=publishing, 1=success, 2=failed)
        article_id: Article ID (if published)
        article_url: Article URL (if published)
        fail_reason: Failure reason (if failed)
        publish_time: Publish timestamp
    """

    publish_id: str
    status: int  # 0=publishing, 1=success, 2=failed
    article_id: Optional[str] = None
    article_url: Optional[str] = None
    fail_reason: Optional[str] = None
    publish_time: Optional[datetime] = None

    @property
    def is_publishing(self) -> bool:
        """Check if still publishing."""
        return self.status == 0

    @property
    def is_success(self) -> bool:
        """Check if publish succeeded."""
        return self.status == 1

    @property
    def is_failed(self) -> bool:
        """Check if publish failed."""
        return self.status == 2

    def __str__(self) -> str:
        status_map = {0: "Publishing...", 1: "Success", 2: "Failed"}
        status_str = status_map.get(self.status, "Unknown")
        parts = [f"Publish Status: {status_str}"]

        if self.article_url:
            parts.append(f"URL: {self.article_url}")

        if self.fail_reason:
            parts.append(f"Reason: {self.fail_reason}")

        return " | ".join(parts)
