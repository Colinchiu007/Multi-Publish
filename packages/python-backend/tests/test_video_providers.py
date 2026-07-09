"""Tests for AI Video Generation Providers (Phase 5.4).

Mirrors test_image_providers.py template: each provider gets
metadata / get_info / get_status / dry_run / idempotency / execute-fails-no-key coverage.
"""

from __future__ import annotations

import pytest

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.providers.video import (
    CogVideoVideo,
    GrokVideo,
    HeyGenVideo,
    HiggsFieldVideo,
    HunyuanVideo,
    KlingVideo,
    LTXVideoLocal,
    LTXVideoModal,
    MiniMaxVideo,
    RunwayVideo,
    SeedanceReplicate,
    SeedanceVideo,
    VeoVideo,
    WanVideo,
)

# ──────────────────────────────────────────────
# Shared validation helpers (mirror test_image_providers.py)
# ──────────────────────────────────────────────


def _check_tool_metadata(tool: BaseTool):
    assert isinstance(tool.name, str) and tool.name, f"{type(tool).__name__} missing name"
    assert isinstance(tool.capability, str) and tool.capability
    assert isinstance(tool.provider, str) and tool.provider
    assert isinstance(tool.tier, ToolTier)
    assert isinstance(tool.stability, ToolStability)
    assert isinstance(tool.execution_mode, ExecutionMode)
    assert isinstance(tool.determinism, Determinism)
    assert tool.version
    assert isinstance(tool.dependencies, list)
    assert isinstance(tool.install_instructions, str)
    assert isinstance(tool.capabilities, list)
    assert isinstance(tool.best_for, list)
    assert isinstance(tool.not_good_for, list)
    assert isinstance(tool.resource_profile, ResourceProfile)


def _check_get_info(tool: BaseTool):
    info = tool.get_info()
    assert info["name"] == tool.name
    assert info["capability"] == tool.capability
    assert info["provider"] == tool.provider
    assert info["tier"] == tool.tier.value
    assert "resource_profile" in info


def _check_dry_run(tool: BaseTool):
    result = tool.dry_run({"prompt": "test"})
    assert isinstance(result, dict)
    assert result["tool"] == tool.name
    assert "would_execute" in result


def _check_idempotency(tool: BaseTool, a_key: str = "prompt"):
    if not tool.idempotency_key_fields:
        pytest.skip(f"{tool.name} has no idempotency_key_fields")
    inputs_a = {k: "a" if k == a_key else 1 for k in tool.idempotency_key_fields}
    inputs_a2 = dict(inputs_a)
    inputs_b = {k: "b" if k == a_key else 1 for k in tool.idempotency_key_fields}
    k1 = tool.idempotency_key(inputs_a)
    k2 = tool.idempotency_key(inputs_a2)
    k3 = tool.idempotency_key(inputs_b)
    assert k1 == k2
    if a_key in tool.idempotency_key_fields:
        assert k1 != k3, f"idempotency_key should differ when {a_key} changes"


def _check_runtime_is_valid(tool: BaseTool):
    """Video providers use either API or local_gpu runtime."""
    assert tool.runtime in (ToolRuntime.API, ToolRuntime.LOCAL_GPU), (
        f"{tool.name} has unexpected runtime {tool.runtime}"
    )


def _check_estimate_cost_nonnegative(tool: BaseTool):
    cost = tool.estimate_cost({"prompt": "test"})
    assert isinstance(cost, (int, float))
    assert cost >= 0


def _check_estimate_runtime_nonnegative(tool: BaseTool):
    rt = tool.estimate_runtime({"prompt": "test"})
    assert isinstance(rt, (int, float))
    assert rt >= 0


# ──────────────────────────────────────────────
# Per-provider tests
# ──────────────────────────────────────────────

PROVIDER_CLASSES = [
    KlingVideo,
    RunwayVideo,
    VeoVideo,
    HunyuanVideo,
    MiniMaxVideo,
    WanVideo,
    CogVideoVideo,
    GrokVideo,
    HeyGenVideo,
    SeedanceVideo,
    SeedanceReplicate,
    LTXVideoLocal,
    LTXVideoModal,
    HiggsFieldVideo,
]


@pytest.mark.parametrize("cls", PROVIDER_CLASSES, ids=lambda c: c.__name__)
class TestVideoProviderMetadata:
    def test_metadata(self, cls):
        _check_tool_metadata(cls())

    def test_get_info(self, cls):
        _check_get_info(cls())

    def test_get_status_returns_toolstatus(self, cls):
        assert isinstance(cls().get_status(), ToolStatus)

    def test_dry_run(self, cls):
        _check_dry_run(cls())

    def test_idempotency(self, cls):
        _check_idempotency(cls())

    def test_runtime_is_valid(self, cls):
        _check_runtime_is_valid(cls())

    def test_estimate_cost_nonnegative(self, cls):
        _check_estimate_cost_nonnegative(cls())

    def test_estimate_runtime_nonnegative(self, cls):
        _check_estimate_runtime_nonnegative(cls())

    def test_capabilities_nonempty(self, cls):
        assert cls().capabilities, f"{cls.__name__} has empty capabilities"

    def test_install_instructions_nonempty(self, cls):
        assert cls().install_instructions, f"{cls.__name__} has empty install_instructions"


# ──────────────────────────────────────────────
# Provider-specific spot checks
# ──────────────────────────────────────────────


class TestKlingVideo:
    def setup_method(self):
        self.tool = KlingVideo()

    def test_provider_name(self):
        assert self.tool.provider == "kling"

    def test_estimate_cost_standard(self):
        # standard v3/standard, 5s → 0.10
        assert self.tool.estimate_cost({"model_variant": "v3/standard", "duration": "5"}) == 0.10

    def test_estimate_cost_pro(self):
        assert self.tool.estimate_cost({"model_variant": "pro", "duration": "5"}) == 0.20

    def test_estimate_cost_master(self):
        assert self.tool.estimate_cost({"model_variant": "master", "duration": "5"}) == 0.30

    def test_estimate_cost_scales_with_duration(self):
        cost_5 = self.tool.estimate_cost({"duration": "5"})
        cost_10 = self.tool.estimate_cost({"duration": "10"})
        assert cost_10 == cost_5 * 2

    def test_execute_fails_no_key(self):
        # No FAL_KEY in env → execute returns failure
        import os
        original = os.environ.pop("FAL_KEY", None)
        os.environ.pop("FAL_AI_API_KEY", None)
        try:
            result = self.tool.execute({"prompt": "test"})
            assert result.success is False
        finally:
            if original:
                os.environ["FAL_KEY"] = original


class TestVeoVideo:
    def setup_method(self):
        self.tool = VeoVideo()

    def test_provider_name(self):
        assert self.tool.provider == "veo"

    def test_capabilities_include_text_to_video(self):
        assert "text_to_video" in self.tool.capabilities


class TestRunwayVideo:
    def setup_method(self):
        self.tool = RunwayVideo()

    def test_provider_name(self):
        assert self.tool.provider == "runway"


class TestHunyuanVideo:
    def setup_method(self):
        self.tool = HunyuanVideo()

    def test_provider_name(self):
        assert self.tool.provider == "hunyuan"


class TestMiniMaxVideo:
    def setup_method(self):
        self.tool = MiniMaxVideo()

    def test_provider_name(self):
        assert self.tool.provider == "minimax"


class TestWanVideo:
    def setup_method(self):
        self.tool = WanVideo()

    def test_provider_name(self):
        assert self.tool.provider == "wan"


class TestCogVideoVideo:
    def setup_method(self):
        self.tool = CogVideoVideo()

    def test_provider_name(self):
        assert self.tool.provider == "cogvideo"


class TestGrokVideo:
    def setup_method(self):
        self.tool = GrokVideo()

    def test_provider_name(self):
        assert self.tool.provider == "grok"


class TestHeyGenVideo:
    def setup_method(self):
        self.tool = HeyGenVideo()

    def test_provider_name(self):
        assert self.tool.provider == "heygen"


class TestSeedanceVideo:
    def setup_method(self):
        self.tool = SeedanceVideo()

    def test_provider_name(self):
        assert self.tool.provider == "seedance"


class TestSeedanceReplicate:
    def setup_method(self):
        self.tool = SeedanceReplicate()

    def test_provider_name(self):
        assert self.tool.provider in ("seedance", "replicate")


class TestLTXVideoLocal:
    def setup_method(self):
        self.tool = LTXVideoLocal()

    def test_provider_name(self):
        assert self.tool.provider == "ltx"


class TestLTXVideoModal:
    def setup_method(self):
        self.tool = LTXVideoModal()

    def test_provider_name(self):
        assert self.tool.provider == "ltx-modal"


class TestHiggsFieldVideo:
    def setup_method(self):
        self.tool = HiggsFieldVideo()

    def test_provider_name(self):
        assert self.tool.provider == "higgsfield"
