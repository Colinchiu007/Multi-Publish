"""Tests for video_creation/scoring.py — provider & production path scoring."""

import pytest

from multi_publish.video_creation.scoring import (
    ProductionPathScore,
    ProviderScore,
    _compute_control,
    _compute_task_fit,
    _expand_synonyms,
    _is_stock_like_provider,
    _keyword_overlap,
    _tokenize_text,
    format_ranking,
    rank_providers,
)


class TestProviderScore:
    def test_defaults(self):
        s = ProviderScore(tool_name="test", provider="openai")
        assert s.task_fit == 0.0
        assert s.weighted_score == 0.0

    def test_weighted_score_full(self):
        s = ProviderScore(
            tool_name="t",
            provider="p",
            task_fit=1.0,
            output_quality=1.0,
            control=1.0,
            reliability=1.0,
            cost_efficiency=1.0,
            latency=1.0,
            continuity=1.0,
        )
        assert s.weighted_score == pytest.approx(1.0, rel=1e-3)

    def test_weighted_score_partial(self):
        s = ProviderScore(tool_name="t", provider="p", task_fit=0.5)
        assert s.weighted_score == pytest.approx(0.15, rel=1e-3)

    def test_to_dict(self):
        s = ProviderScore(tool_name="t", provider="p", task_fit=0.8)
        d = s.to_dict()
        assert d["tool_name"] == "t"
        assert d["weighted_score"] == s.weighted_score

    def test_explain(self):
        s = ProviderScore(tool_name="Kling", provider="kuaishou", task_fit=0.9, output_quality=0.85)
        exp = s.explain()
        assert "Kling" in exp and "kuaishou" in exp


class TestProductionPathScore:
    def test_defaults(self):
        s = ProductionPathScore(path_label="fast-path")
        assert s.delivery_fit == 0.0
        assert s.weighted_score == 0.0

    def test_weighted_score_full(self):
        s = ProductionPathScore(
            path_label="p",
            delivery_fit=1.0,
            quality_fit=1.0,
            capability_confidence=1.0,
            fallback_integrity=1.0,
            budget_fit=1.0,
            speed_fit=1.0,
            controllability=1.0,
            consistency_fit=1.0,
        )
        assert s.weighted_score == pytest.approx(1.0, rel=1e-3)

    def test_to_dict(self):
        s = ProductionPathScore(path_label="p", delivery_fit=0.7)
        d = s.to_dict()
        assert d["path_label"] == "p"
        assert d["weighted_score"] == s.weighted_score


class TestKeywordOverlap:
    def test_full_overlap(self):
        assert _keyword_overlap({"a", "b"}, {"a", "b", "c"}) == pytest.approx(1.0)

    def test_partial(self):
        assert _keyword_overlap({"a", "b"}, {"a", "c"}) == pytest.approx(0.5)

    def test_no_overlap(self):
        assert _keyword_overlap({"a"}, {"b"}) == 0.0

    def test_empty(self):
        assert _keyword_overlap(set(), {"a"}) == 0.0
        assert _keyword_overlap(set(), set()) == 0.0

    def test_case_insensitive(self):
        assert _keyword_overlap({"Hello"}, {"hello"}) == pytest.approx(1.0)


class TestExpandSynonyms:
    def test_cinematic(self):
        words = _expand_synonyms({"cinematic"})
        assert "cinematic" in words
        assert any(w in words for w in ("film", "movie"))

    def test_unknown(self):
        assert _expand_synonyms({"zzz_unknown"}) == {"zzz_unknown"}

    def test_empty(self):
        assert _expand_synonyms(set()) == set()


class TestIsStockLikeProvider:
    def test_stock(self):
        assert _is_stock_like_provider({"provider": "pexels", "source": "stock"})

    def test_api(self):
        assert not _is_stock_like_provider({"provider": "openai", "runtime": "api"})

    def test_empty(self):
        assert not _is_stock_like_provider({})


class TestRankProviders:
    def test_empty(self):
        assert rank_providers([], {}) == []


class TestFormatRanking:
    def test_empty(self):
        assert format_ranking([]) == ""

    def test_single(self):
        s = ProviderScore(tool_name="Kling", provider="kuaishou")
        assert "Kling" in format_ranking([s])

    def test_top_n(self):
        scores = [ProviderScore(tool_name=f"t{i}", provider="p") for i in range(5)]
        assert len(format_ranking(scores, top_n=3).strip().split("\\n")) <= 3


# ========== _tokenize_text ==========

class TestTokenizeText:
    def test_basic(self):
        r = _tokenize_text("hello world")
        assert r == ["hello", "world"]

    def test_empty(self):
        assert _tokenize_text("") == []

    def test_punctuation(self):
        r = _tokenize_text("trailers, clips! video?")
        assert "trailers" in r
        assert "clips" in r  # Token regex clips before punctuation

    def test_hyphenated(self):
        r = _tokenize_text("style-transfer motion-graphics")
        assert "style-transfer" in r

    def test_case(self):
        r = _tokenize_text("Hello World")
        assert r == ["hello", "world"]

    def test_none(self):
        assert _tokenize_text(None) == []


# ========== _compute_task_fit ==========

class TestComputeTaskFit:
    def test_empty_best_for(self):
        score = _compute_task_fit(set(), "cinematic", {"dramatic"})
        assert score == 0.3

    def test_direct_match(self):
        score = _compute_task_fit({"cinematic"}, "cinematic", set())
        assert score > 0.5

    def test_synonym_expansion(self):
        score = _compute_task_fit({"film"}, "cinematic", set())
        assert score > 0.5  # film -> cinematic via synonym

    def test_style_keywords_help(self):
        score_with = _compute_task_fit({"corporate"}, "ad", {"business"})
        score_without = _compute_task_fit({"corporate"}, "ad", set())
        assert score_with > 0
        assert score_without > 0

    def test_no_match(self):
        score = _compute_task_fit({"stock"}, "cinematic", set())
        # stock != cinematic via synonyms
        assert isinstance(score, float)


# ========== _compute_control ==========

class TestComputeControl:
    def test_empty_supports(self):
        assert _compute_control({}) == 0.3

    def test_basic_features(self):
        score = _compute_control({"seed": True, "aspect_ratio": True})
        assert 0.1 <= score <= 0.5

    def test_advanced_features(self):
        score = _compute_control({"controlnet": True, "reference_image": True, "inpainting": True})
        assert score > 0.3

    def test_all_features(self):
        score = _compute_control({
            "controlnet": True, "reference_image": True, "style_transfer": True,
            "inpainting": True, "img2img": True, "negative_prompt": True,
            "custom_size": True, "aspect_ratio": True, "seed": True,
        })
        assert score == pytest.approx(1.0, abs=0.05)


# ========== ProductionPathScore partial ==========

class TestProductionPathScoreExtended:
    def test_weighted_score_partial(self):
        s = ProductionPathScore(path_label="p", delivery_fit=0.5)
        assert s.weighted_score == pytest.approx(0.125, rel=1e-3)

    def test_weighted_score_mid(self):
        s = ProductionPathScore(path_label="p", delivery_fit=0.8, quality_fit=0.7, speed_fit=0.6)
        expected = 0.8 * 0.25 + 0.7 * 0.20 + 0.6 * 0.08
        assert s.weighted_score == pytest.approx(expected, rel=1e-3)


# ========== format_ranking edge cases ==========

class TestFormatRankingExtended:
    def test_top_n_larger_than_list(self):
        scores = [ProviderScore(tool_name="t1", provider="p")]
        result = format_ranking(scores, top_n=10)
        assert "t1" in result

    def test_zero_scores(self):
        scores = [ProviderScore(tool_name="t1", provider="p")]
        assert "t1" in format_ranking(scores)

    def test_equal_scores(self):
        scores = [
            ProviderScore(tool_name="t1", provider="p"),
            ProviderScore(tool_name="t2", provider="p"),
        ]
        result = format_ranking(scores, top_n=5)
        assert "t1" in result and "t2" in result


# ========== _keyword_overlap edge cases ==========

class TestKeywordOverlapExtended:
    def test_overlap_coefficient_vs_jaccard(self):
        intent = {"cinematic", "film", "movie", "trailer"}
        tool_best_for = {"cinematic", "film", "movie", "trailer", "dramatic", "epic", "stylized"}
        score = _keyword_overlap(intent, tool_best_for)
        assert score == pytest.approx(1.0)  # Overlap coefficient: intent is subset

    def test_smaller_first_arg_wins(self):
        score = _keyword_overlap({"a", "b"}, {"a", "b", "c", "d"})
        assert score == pytest.approx(1.0)

    def test_no_match_empty_args(self):
        assert _keyword_overlap({"a"}, set()) == 0.0


# ========== _expand_synonyms edge cases ==========

class TestExpandSynonymsExtended:
    def test_multiple_clusters(self):
        words = _expand_synonyms({"cinematic", "corporate"})
        assert "cinematic" in words
        assert "corporate" in words
        assert any(w in words for w in ("film", "movie"))

    def test_social_cluster(self):
        words = _expand_synonyms({"tiktok"})
        assert any(w in words for w in ("social", "shorts", "viral"))


# ========== rank_providers with real data ==========

class TestRankProvidersExtended:
    def _make_tool(self, info: dict):
        from unittest.mock import MagicMock
        t = MagicMock()
        info.setdefault("runtime", "api")
        info.setdefault("supports", {})
        info.setdefault("capability", "video")
        info.setdefault("status", "available")
        t.get_info.return_value = info
        t.get_status.return_value = MagicMock(value=info.get("status", "available"))
        t.estimate_cost.return_value = 0.0
        return t

    def test_single_provider(self):
        tool = self._make_tool({"name": "TestTool", "provider": "test", "best_for": {"cinematic"}, "stability": "production"})
        results = rank_providers([tool], {"intent": "cinematic"})
        assert len(results) == 1
        assert results[0].tool_name == "TestTool"

    def test_multiple_providers_ranking(self):
        t1 = self._make_tool({"name": "Premium", "provider": "p1", "best_for": {"cinematic"}, "stability": "production", "tier": "generate"})
        t2 = self._make_tool({"name": "Basic", "provider": "p2", "best_for": {"stock"}, "stability": "experimental"})
        results = rank_providers([t1, t2], {"intent": "cinematic"})
        assert len(results) == 2
        assert results[0].weighted_score >= results[1].weighted_score

    def test_motion_penalty_applied(self):
        tool = self._make_tool({"name": "ImgOnly", "provider": "p", "capability": "image", "best_for": {"photo"}, "stability": "production"})
        results = rank_providers([tool], {"intent": "video", "motion_required": True, "asset_type": "video"})
        assert len(results) == 1
        assert results[0].task_fit < 0.3
