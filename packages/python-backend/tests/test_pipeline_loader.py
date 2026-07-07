"""Tests for pipeline manifest loader (Phase 6)."""

from __future__ import annotations

import pytest

from multi_publish.video_creation.pipeline.loader import (
    _condition_is_active,
    check_extension_permitted,
    get_permitted_extensions,
    get_reference_input_config,
    get_required_tools,
    get_stage_order,
    get_stage_review_focus,
    get_stage_skill,
    pipeline_supports_reference_input,
)

SAMPLE_MANIFEST = {
    "name": "test_pipeline",
    "version": "1.0",
    "stages": [
        {"name": "analysis", "preferred_tools": ["transcriber"], "review_focus": ["accuracy"]},
        {
            "name": "generation",
            "preferred_tools": ["hunyuan"],
            "fallback_tools": ["kling"],
            "sub_stages": [
                {"name": "draft", "condition": "user_prefers_draft"},
                {"name": "final", "condition": None},
            ],
        },
        {"name": "review", "skill": "agent-skills:code-review-and-quality", "review_focus": ["quality", "style"]},
    ],
    "reference_input": {"supported": True, "max_duration": 60},
    "extensions": {"custom_scripts": True, "custom_playbooks": False},
}


class TestPipelineLoader:
    def test_get_stage_order_default(self):
        stages = get_stage_order(SAMPLE_MANIFEST)
        assert stages == ["analysis", "generation", "review"]

    def test_get_stage_order_with_sub_stages(self):
        stages = get_stage_order(SAMPLE_MANIFEST, include_sub_stages=True)
        assert "generation.draft" in stages
        assert "generation.final" in stages

    def test_get_stage_order_active_sub_stages(self):
        stages = get_stage_order(SAMPLE_MANIFEST, include_sub_stages=True)
        assert "analysis" in stages

    def test_get_required_tools(self):
        tools = get_required_tools(SAMPLE_MANIFEST)
        assert "transcriber" in tools
        assert "hunyuan" in tools
        assert "kling" in tools

    def test_get_stage_skill_found(self):
        skill = get_stage_skill(SAMPLE_MANIFEST, "review")
        assert skill == "agent-skills:code-review-and-quality"

    def test_get_stage_skill_not_found(self):
        assert get_stage_skill(SAMPLE_MANIFEST, "nonexistent") is None

    def test_get_stage_review_focus(self):
        focus = get_stage_review_focus(SAMPLE_MANIFEST, "analysis")
        assert "accuracy" in focus

    def test_get_stage_review_focus_not_found(self):
        assert get_stage_review_focus(SAMPLE_MANIFEST, "nonexistent") == []

    def test_reference_input_config(self):
        cfg = get_reference_input_config(SAMPLE_MANIFEST)
        assert cfg.get("supported") is True

    def test_supports_reference_input(self):
        assert pipeline_supports_reference_input(SAMPLE_MANIFEST) is True

    def test_no_reference_input(self):
        manifest = {"stages": [], "reference_input": {}}
        assert pipeline_supports_reference_input(manifest) is False

    def test_check_extension_permitted_allows(self):
        check_extension_permitted(SAMPLE_MANIFEST, "custom_scripts")

    def test_check_extension_permitted_raises(self):
        with pytest.raises(PermissionError):
            check_extension_permitted(SAMPLE_MANIFEST, "custom_playbooks")

    def test_get_permitted_extensions(self):
        ext = get_permitted_extensions(SAMPLE_MANIFEST)
        assert ext["custom_scripts"] is True
        assert ext["custom_playbooks"] is False

    def test_condition_no_condition(self):
        assert _condition_is_active(None, {}) is True

    def test_condition_with_context_true(self):
        assert _condition_is_active("flag", {"flag": True}) is True

    def test_condition_no_context(self):
        assert _condition_is_active("flag", None) is False
