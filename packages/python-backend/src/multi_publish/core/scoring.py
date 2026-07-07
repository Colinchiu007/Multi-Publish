"""Content quality and platform fit scoring engine.

Adapted from OpenMontage lib/scoring.py (MIT).
Provides weighted multi-dimensional scoring for:
- Content quality pre-publish gate
- Platform fit recommendation
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class ScoreDimension(Enum):
    """Scoring dimensions with their weights."""
    TITLE_CLARITY = "title_clarity"
    CONTENT_DEPTH = "content_depth"
    READABILITY = "readability"
    SEO_FRIENDLINESS = "seo_friendliness"
    ENGAGEMENT_POTENTIAL = "engagement_potential"

    @property
    def weight(self) -> float:
        return _DIMENSION_WEIGHTS[self]


_DIMENSION_WEIGHTS = {
    ScoreDimension.TITLE_CLARITY: 0.25,
    ScoreDimension.CONTENT_DEPTH: 0.20,
    ScoreDimension.READABILITY: 0.20,
    ScoreDimension.SEO_FRIENDLINESS: 0.15,
    ScoreDimension.ENGAGEMENT_POTENTIAL: 0.20,
}


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


@dataclass
class ContentQualityScore:
    """Multi-dimensional score for content quality pre-publish gate."""
    title_clarity: float = 0.0
    content_depth: float = 0.0
    readability: float = 0.0
    seo_friendliness: float = 0.0
    engagement_potential: float = 0.0

    def __post_init__(self):
        for dim in ScoreDimension:
            value = getattr(self, dim.value)
            setattr(self, dim.value, _clamp(value))

    @property
    def overall(self) -> float:
        return sum(
            getattr(self, dim.value) * dim.weight
            for dim in ScoreDimension
        )

    def to_dict(self) -> dict[str, float]:
        return {
            dim.value: getattr(self, dim.value)
            for dim in ScoreDimension
        } | {"overall": self.overall}


@dataclass
class PlatformFitScore:
    """Multi-dimensional score for platform-content fit."""
    text_compatibility: float = 0.0
    media_compatibility: float = 0.0
    audience_relevance: float = 0.0
    timing_fitness: float = 0.0
    historical_performance: float = 0.0

    def __post_init__(self):
        for field_name in [
            "text_compatibility", "media_compatibility",
            "audience_relevance", "timing_fitness", "historical_performance",
        ]:
            setattr(self, field_name, _clamp(getattr(self, field_name)))

    @property
    def overall(self) -> float:
        return (
            self.text_compatibility * 0.30
            + self.media_compatibility * 0.25
            + self.audience_relevance * 0.20
            + self.timing_fitness * 0.15
            + self.historical_performance * 0.10
        )

    def to_dict(self) -> dict[str, float]:
        return {
            "text_compatibility": self.text_compatibility,
            "media_compatibility": self.media_compatibility,
            "audience_relevance": self.audience_relevance,
            "timing_fitness": self.timing_fitness,
            "historical_performance": self.historical_performance,
            "overall": self.overall,
        }


def score_content_quality(
    title: str,
    content: str,
    platform: str = "",
) -> ContentQualityScore:
    """Score content quality before publishing.

    Analyzes title length, content depth, readability, SEO, and engagement.
    Returns a ContentQualityScore with normalized 0-1 values.
    """
    if not title and not content:
        return ContentQualityScore()

    title_len = len(title) if title else 0
    if title_len >= 40:
        title_score = 0.9
    elif title_len >= 20:
        title_score = 0.7
    elif title_len >= 10:
        title_score = 0.5
    elif title_len >= 5:
        title_score = 0.3
    else:
        title_score = 0.1

    content_len = len(content) if content else 0
    if content_len >= 2000:
        depth_score = 0.9
    elif content_len >= 1000:
        depth_score = 0.7
    elif content_len >= 500:
        depth_score = 0.5
    elif content_len >= 100:
        depth_score = 0.3
    else:
        depth_score = 0.1

    sentences = re.split(r'[。！？.!?]', content) if content else []
    if sentences:
        valid = [s for s in sentences if s.strip()]
        avg_sentence_len = sum(len(s) for s in valid) / max(len(valid), 1)
        if 10 <= avg_sentence_len <= 40:
            readability_score = 0.8
        elif avg_sentence_len < 10:
            readability_score = 0.5
        else:
            readability_score = 0.4
    else:
        readability_score = 0.3

    has_headings = bool(re.search(r'^#|^##|^###', content, re.MULTILINE)) if content else False
    has_keywords = len(set(re.findall(r'[\w]+', title))) >= 3 if title else False
    seo_score = 0.0
    if has_headings:
        seo_score += 0.4
    if has_keywords:
        seo_score += 0.3
    if content_len >= 300:
        seo_score += 0.3

    has_emoji = bool(re.search(r'[\U0001F300-\U0001FFFF]', title + content))
    has_questions = "?" in content or "？" in content
    engagement = 0.3
    if has_emoji:
        engagement += 0.3
    if has_questions:
        engagement += 0.2
    if title_len >= 15:
        engagement += 0.2

    return ContentQualityScore(
        title_clarity=title_score,
        content_depth=depth_score,
        readability=readability_score,
        seo_friendliness=seo_score,
        engagement_potential=engagement,
    )


def score_platform_fit(
    platform: str,
    content_type: str = "text",
    has_media: bool = False,
) -> PlatformFitScore:
    """Score how well content fits a target platform."""
    from multi_publish.models import PLATFORM_META, PlatformType

    try:
        pt = PlatformType(platform)
        meta = PLATFORM_META.get(pt, {})
        platform_category = meta.get("category", "image_text")
    except (ValueError, KeyError):
        platform_category = "image_text"

    if platform_category == "image_text":
        text_fit = 0.9 if content_type in ("text", "image_text") else 0.4
    elif platform_category == "video":
        text_fit = 0.6 if content_type in ("text", "image_text") else 0.9
    else:
        text_fit = 0.8

    if not has_media:
        media_fit = 0.5
    elif platform_category == "video" and content_type == "video":
        media_fit = 0.95
    elif platform_category == "image_text" and content_type in ("text", "image_text"):
        media_fit = 0.9
    else:
        media_fit = 0.6

    return PlatformFitScore(
        text_compatibility=text_fit,
        media_compatibility=media_fit,
        audience_relevance=0.7,
        timing_fitness=0.7,
        historical_performance=0.5,
    )
