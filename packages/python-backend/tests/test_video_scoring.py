"""Tests for video_creation/scoring.py — provider & production path scoring."""
import pytest
from multi_publish.video_creation.scoring import (
    ProviderScore, ProductionPathScore, _keyword_overlap,
    _expand_synonyms, _is_stock_like_provider,
    rank_providers, format_ranking,
)

class TestProviderScore:
    def test_defaults(self):
        s = ProviderScore(tool_name="test", provider="openai")
        assert s.task_fit == 0.0
        assert s.weighted_score == 0.0
    def test_weighted_score_full(self):
        s = ProviderScore(tool_name="t", provider="p", task_fit=1.0,
            output_quality=1.0, control=1.0, reliability=1.0,
            cost_efficiency=1.0, latency=1.0, continuity=1.0)
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
        s = ProviderScore(tool_name="Kling", provider="kuaishou",
            task_fit=0.9, output_quality=0.85)
        exp = s.explain()
        assert "Kling" in exp and "kuaishou" in exp

class TestProductionPathScore:
    def test_defaults(self):
        s = ProductionPathScore(path_label="fast-path")
        assert s.delivery_fit == 0.0
        assert s.weighted_score == 0.0
    def test_weighted_score_full(self):
        s = ProductionPathScore(path_label="p", delivery_fit=1.0,
            quality_fit=1.0, capability_confidence=1.0,
            fallback_integrity=1.0, budget_fit=1.0, speed_fit=1.0,
            controllability=1.0, consistency_fit=1.0)
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
