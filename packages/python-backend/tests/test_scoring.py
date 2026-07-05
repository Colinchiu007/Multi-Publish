"""Tests for Scoring engine (adapted from OpenMontage scoring.py).

Tests cover:
- ContentQualityScore: normal/edge/error cases
- PlatformFitScore: platform recommendation scoring
- Weighted scoring calculation
"""

import pytest
from multi_publish.core.scoring import (
    ContentQualityScore,
    PlatformFitScore,
    score_content_quality,
    score_platform_fit,
    ScoreDimension,
)


class TestContentQualityScore:
    def test_default_score(self):
        score = ContentQualityScore()
        assert score.title_clarity == 0.0
        assert score.overall == 0.0

    def test_score_with_values(self):
        score = ContentQualityScore(
            title_clarity=0.9,
            content_depth=0.8,
            readability=0.7,
            seo_friendliness=0.6,
            engagement_potential=0.85,
        )
        assert score.title_clarity == 0.9
        assert score.overall == pytest.approx(0.785, rel=1e-3)

    def test_score_clamps_low(self):
        score = ContentQualityScore(title_clarity=-0.5)
        assert score.title_clarity == 0.0

    def test_score_clamps_high(self):
        score = ContentQualityScore(title_clarity=1.5)
        assert score.title_clarity == 1.0

    @pytest.mark.parametrize("dim,expected", [
        (ScoreDimension.TITLE_CLARITY, 0.25),
        (ScoreDimension.CONTENT_DEPTH, 0.20),
        (ScoreDimension.READABILITY, 0.20),
        (ScoreDimension.SEO_FRIENDLINESS, 0.15),
        (ScoreDimension.ENGAGEMENT_POTENTIAL, 0.20),
    ])
    def test_dimension_weights(self, dim, expected):
        assert dim.weight == expected

    def test_overall_is_weighted_average(self):
        score = ContentQualityScore(
            title_clarity=1.0,
            content_depth=0.0,
            readability=0.0,
            seo_friendliness=0.0,
            engagement_potential=0.0,
        )
        assert score.overall == pytest.approx(0.25, rel=1e-3)


class TestPlatformFitScore:
    def test_platform_fit_default(self):
        score = PlatformFitScore()
        assert score.text_compatibility == 0.0
        assert score.media_compatibility == 0.0

    def test_platform_fit_scoring(self):
        score = PlatformFitScore(
            text_compatibility=0.9,
            media_compatibility=0.8,
            audience_relevance=0.7,
            timing_fitness=0.6,
            historical_performance=0.85,
        )
        assert score.overall == pytest.approx(0.785, rel=1e-3)

    def test_platform_fit_clamps(self):
        score = PlatformFitScore(text_compatibility=-0.1)
        assert score.text_compatibility == 0.0


class TestScoringFunctions:
    def test_score_content_quality_full(self):
        result = score_content_quality(
            title="test title",
            content="this is some test content with enough depth and readability for scoring purposes",
            platform="wechat_mp",
        )
        assert isinstance(result, ContentQualityScore)
        assert 0.0 <= result.overall <= 1.0
        assert result.title_clarity > 0

    def test_score_content_quality_empty(self):
        result = score_content_quality(title="", content="", platform="wechat_mp")
        assert result.overall == 0.0

    def test_score_content_quality_short_title(self):
        result = score_content_quality(title="ab", content="content", platform="wechat_mp")
        assert result.title_clarity < 0.5

    def test_score_platform_fit(self):
        result = score_platform_fit(
            platform="douyin",
            content_type="video",
            has_media=True,
        )
        assert isinstance(result, PlatformFitScore)
        assert 0.0 <= result.overall <= 1.0

    def test_score_platform_fit_video_on_image_platform(self):
        result = score_platform_fit(
            platform="wechat_mp",
            content_type="video",
            has_media=True,
        )
        assert result.overall < 0.6


class TestScoreIntegration:
    def test_recommend_platform(self):
        platforms = ["douyin", "wechat_mp", "xiaohongshu"]
        results = {}
        for p in platforms:
            results[p] = score_platform_fit(
                platform=p,
                content_type="image_text",
                has_media=True,
            )
        assert results["xiaohongshu"].overall > results["douyin"].overall

    def test_quality_gate_threshold(self):
        result = score_content_quality(
            title="A complete and engaging title example",
            content="This is a piece of content with substantial depth and good readability.",
            platform="wechat_mp",
        )
        assert result.overall >= 0.3
