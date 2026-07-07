"""Tests for AI Image Generation Providers (Phase 2)."""

from __future__ import annotations

import os

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
from multi_publish.video_creation.providers.image import (
    CodeSnippet,
    ComfyUIImage,
    DiagramGen,
    FluxImage,
    GoogleImagen,
    GrokImage,
    ImageGen,
    ImageSelector,
    LocalDiffusion,
    MathAnimate,
    OpenAIImage,
    PexelsImage,
    PixabayImage,
    RecraftImage,
)

# ──────────────────────────────────────────────
# Shared validation helpers
# ──────────────────────────────────────────────


def _check_tool_metadata(tool: BaseTool):
    assert isinstance(tool.name, str) and tool.name, f"Tool {type(tool).__name__} missing name"
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


def _check_idempotency(
    tool: BaseTool, a_key: str = "prompt", a_val: str = "a", b_val: str = "b", seed_key: str = "seed"
):
    """Verify idempotency keys differ when inputs change."""
    if not tool.idempotency_key_fields:
        pytest.skip(f"{tool.name} has no idempotency_key_fields")
    # Build two dicts where only one tracked field differs
    inputs_a = {k: a_val if k == a_key else (1 if k == seed_key else None) for k in tool.idempotency_key_fields}
    inputs_b = {k: b_val if k == a_key else (1 if k == seed_key else None) for k in tool.idempotency_key_fields}
    inputs_a2 = dict(inputs_a)

    k1 = tool.idempotency_key(inputs_a)
    k2 = tool.idempotency_key(inputs_a2)
    k3 = tool.idempotency_key(inputs_b)

    assert k1 == k2
    # Only assert inequality if a_key is actually in idempotency_key_fields
    if a_key in tool.idempotency_key_fields:
        assert k1 != k3, f"idempotency_key should differ when {a_key} changes"


# ──────────────────────────────────────────────
# Tests per provider
# ──────────────────────────────────────────────


class TestFluxImage:
    def setup_method(self):
        self.tool = FluxImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_estimate_cost_pro(self):
        # Empty dict defaults to flux-pro/v1.1 -> 0.05
        assert self.tool.estimate_cost({}) == 0.05

    def test_estimate_cost_dev(self):
        assert self.tool.estimate_cost({"model": "flux/dev"}) == 0.03

    def test_capabilities(self):
        assert "generate_image" in self.tool.capabilities

    def test_provider(self):
        assert self.tool.provider == "flux"

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestOpenAIImage:
    def setup_method(self):
        self.tool = OpenAIImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_estimate_cost_gpt_image_low(self):
        assert self.tool.estimate_cost({"model": "gpt-image-1", "quality": "low"}) == 0.011

    def test_estimate_cost_gpt_image_high_n2(self):
        assert self.tool.estimate_cost({"model": "gpt-image-1", "quality": "high", "n": 2}) == 0.334

    def test_estimate_cost_dalle_hd(self):
        assert self.tool.estimate_cost({"model": "dall-e-3", "quality": "hd"}) == 0.08

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestGoogleImagen:
    def setup_method(self):
        self.tool = GoogleImagen()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_estimate_cost_default(self):
        assert self.tool.estimate_cost({"model": "imagen-4.0-generate-001"}) == 0.04

    def test_estimate_cost_ultra(self):
        assert self.tool.estimate_cost({"model": "imagen-4.0-ultra-generate-001", "number_of_images": 2}) == 0.12

    def test_estimate_cost_fast(self):
        assert self.tool.estimate_cost({"model": "imagen-4.0-fast-generate-001"}) == 0.02

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestGrokImage:
    def setup_method(self):
        self.tool = GrokImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_estimate_cost_single(self):
        assert self.tool.estimate_cost({"n": 1}) == 0.05

    def test_estimate_cost_multiple(self):
        assert self.tool.estimate_cost({"n": 3}) == pytest.approx(0.15)

    def test_build_payload_generate(self):
        _, payload = self.tool._build_payload({"prompt": "cat"})
        assert payload["prompt"] == "cat"
        assert payload["model"] == "grok-imagine-image"

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestRecraftImage:
    def setup_method(self):
        self.tool = RecraftImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"prompt": "logo"}).success

    def test_estimate_cost_v4(self):
        assert self.tool.estimate_cost({"model": "v4"}) == 0.04

    def test_estimate_cost_v4pro(self):
        assert self.tool.estimate_cost({"model": "v4-pro"}) == 0.25

    def test_capabilities(self):
        assert "generate_logo" in self.tool.capabilities
        assert "generate_vector" in self.tool.capabilities

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestPixabayImage:
    def setup_method(self):
        self.tool = PixabayImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="query")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"query": "cat"}).success

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_tier(self):
        assert self.tool.tier == ToolTier.SOURCE

    def test_capabilities(self):
        assert "stock_image" in self.tool.capabilities

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestPexelsImage:
    def setup_method(self):
        self.tool = PexelsImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="query")

    def test_execute_fails_no_key(self):
        assert not self.tool.execute({"query": "cat"}).success

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_tier(self):
        assert self.tool.tier == ToolTier.SOURCE

    def test_capabilities(self):
        assert "search_image" in self.tool.capabilities

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.API


class TestComfyUIImage:
    def setup_method(self):
        self.tool = ComfyUIImage()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_server(self):
        result = self.tool.execute({"prompt": "cat"})
        assert not result.success
        assert "not reachable" in (result.error or "").lower()

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.LOCAL_GPU

    def test_server_url_default(self):
        assert self.tool._server_url() == "http://localhost:8188"

    def test_server_url_custom(self):
        os.environ["COMFYUI_SERVER_URL"] = "http://192.168.1.100:8188"
        try:
            assert self.tool._server_url() == "http://192.168.1.100:8188"
        finally:
            del os.environ["COMFYUI_SERVER_URL"]


class TestLocalDiffusion:
    def setup_method(self):
        self.tool = LocalDiffusion()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_library(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.LOCAL_GPU

    def test_estimate_runtime_default(self):
        assert self.tool.estimate_runtime({}) == 30.0


class TestImageGen:
    def setup_method(self):
        self.tool = ImageGen()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_execute_fails_no_provider(self):
        assert not self.tool.execute({"prompt": "cat"}).success

    def test_deprecated(self):
        assert "DEPRECATED" in str(self.tool.best_for)

    def test_detect_provider_none(self):
        assert self.tool._detect_provider() is None


class TestImageSelector:
    def setup_method(self):
        self.tool = ImageSelector()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert self.tool.get_status() == ToolStatus.AVAILABLE

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="prompt")

    def test_score_provider_flux(self):
        assert self.tool._score_provider("flux_image", "photorealistic cat") > 0.9

    def test_score_provider_openai(self):
        assert self.tool._score_provider("openai_image", "text on a label") > 0.8

    def test_score_provider_recraft(self):
        assert self.tool._score_provider("recraft_image", "logo design") > 0.9

    def test_score_provider_pixabay(self):
        assert self.tool._score_provider("pixabay_image", "stock photo of nature") > 0.8

    def test_score_provider_local(self):
        assert self.tool._score_provider("local_diffusion", "something") < 0.5

    def test_runtime(self):
        assert self.tool.runtime == ToolRuntime.HYBRID

    def test_execute_rank(self):
        result = self.tool.execute({"prompt": "cat", "operation": "rank"})
        assert result.success
        assert "rankings" in result.data


class TestDiagramGen:
    def setup_method(self):
        self.tool = DiagramGen()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert isinstance(self.tool.get_status(), ToolStatus)

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="diagram_type")

    def test_capabilities(self):
        assert "generate_mermaid" in self.tool.capabilities

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_execute_unknown_type(self):
        result = self.tool.execute({"diagram_type": "unknown"})
        assert not result.success

    def test_execute_mermaid_missing_definition(self):
        result = self.tool.execute({"diagram_type": "mermaid"})
        assert not result.success


class TestCodeSnippet:
    def setup_method(self):
        self.tool = CodeSnippet()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert isinstance(self.tool.get_status(), ToolStatus)

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="code")

    def test_capabilities(self):
        assert "render_code_image" in self.tool.capabilities

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_list_themes(self):
        themes = self.tool.list_themes()
        assert "monokai" in themes
        assert len(themes) >= 4

    def test_execute_fails_missing_deps(self):
        result = self.tool.execute({"code": "print('hello')"})
        if self.tool.get_status() == ToolStatus.UNAVAILABLE:
            assert not result.success


class TestMathAnimate:
    def setup_method(self):
        self.tool = MathAnimate()

    def test_metadata(self):
        _check_tool_metadata(self.tool)

    def test_get_info(self):
        _check_get_info(self.tool)

    def test_get_status(self):
        assert isinstance(self.tool.get_status(), ToolStatus)

    def test_dry_run(self):
        _check_dry_run(self.tool)

    def test_idempotency(self):
        _check_idempotency(self.tool, a_key="scene_code")

    def test_capabilities(self):
        assert "render_scene" in self.tool.capabilities

    def test_free(self):
        assert self.tool.estimate_cost({}) == 0.0

    def test_detect_scene_name_single(self):
        name = self.tool._detect_scene_name("class MyScene(Scene):\n    def construct(self):\n        pass\n")
        assert name == "MyScene"

    def test_detect_scene_name_multiple(self):
        name = self.tool._detect_scene_name("class A(Scene): pass\nclass B(Scene): pass\n")
        assert name == "B"

    def test_detect_scene_name_none(self):
        assert self.tool._detect_scene_name("print('hello')") is None

    def test_estimate_runtime_low(self):
        assert self.tool.estimate_runtime({"quality": "low"}) == 5.0

    def test_estimate_runtime_high(self):
        assert self.tool.estimate_runtime({"quality": "high"}) == 45.0

    def test_estimate_runtime_default(self):
        assert self.tool.estimate_runtime({}) == 15.0

    def test_execute_fails_no_manim(self):
        result = self.tool.execute({"scene_code": "class S(Scene):\n    def construct(self):\n        pass\n"})
        if self.tool.get_status() == ToolStatus.UNAVAILABLE:
            assert not result.success
            assert "manim" in (result.error or "").lower()


# ──────────────────────────────────────────────
# Integration: ToolRegistry discovery
# ──────────────────────────────────────────────


class TestProviderDiscovery:
    def test_auto_discovery(self):
        from multi_publish.video_creation.tool_registry import ToolRegistry

        registry = ToolRegistry()
        tools_found = registry.discover("multi_publish.video_creation.providers.image")
        assert len(tools_found) == 14, f"Found {len(tools_found)} tools: {tools_found}"

        expected = {
            "flux_image",
            "openai_image",
            "google_imagen",
            "grok_image",
            "recraft_image",
            "pixabay_image",
            "pexels_image",
            "comfyui_image",
            "local_diffusion",
            "image_gen",
            "image_selector",
            "diagram_gen",
            "code_snippet",
            "math_animate",
        }
        assert set(tools_found) == expected, f"Missing: {expected - set(tools_found)}"

    def test_registry_capability_filtering(self):
        from multi_publish.video_creation.tool_registry import ToolRegistry

        registry = ToolRegistry()
        registry.discover("multi_publish.video_creation.providers.image")
        image_tools = registry.list_tools()
        assert len(image_tools) == 14

        graphics_tools = [t for t in image_tools if t.capability == "graphics"]
        gen_tools = [t for t in image_tools if t.capability == "image_generation"]
        assert len(graphics_tools) == 3
        assert len(gen_tools) == 11

    def test_registry_status_summary(self):
        from multi_publish.video_creation.tool_registry import ToolRegistry

        registry = ToolRegistry()
        registry.discover("multi_publish.video_creation.providers.image")
        summary = registry.get_status_summary()
        assert summary["total_tools"] == 14
        assert len(summary["capabilities"]) >= 2


# ──────────────────────────────────────────────
# Cross-tool metadata consistency
# ──────────────────────────────────────────────


class TestAllProviderMetadata:
    TOOL_CLASSES = [
        FluxImage,
        OpenAIImage,
        GoogleImagen,
        GrokImage,
        RecraftImage,
        PixabayImage,
        PexelsImage,
        ComfyUIImage,
        LocalDiffusion,
        ImageGen,
        ImageSelector,
        DiagramGen,
        CodeSnippet,
        MathAnimate,
    ]

    def test_all_have_unique_names(self):
        names = [cls.name for cls in self.TOOL_CLASSES if hasattr(cls, "name")]
        assert len(names) == len(set(names)), f"Duplicate names: {names}"

    def test_all_have_unique_providers(self):
        providers = []
        for cls in self.TOOL_CLASSES:
            if hasattr(cls, "provider"):
                providers.append(cls.provider)
        assert len(providers) == len(set(providers)), f"Duplicate providers: {providers}"

    def test_all_have_capabilities_list(self):
        for cls in self.TOOL_CLASSES:
            if hasattr(cls, "capabilities"):
                assert isinstance(cls.capabilities, list)
                assert len(cls.capabilities) >= 1, f"{cls.__name__} has empty capabilities"

    def test_all_tool_runtime_set(self):
        for cls in self.TOOL_CLASSES:
            if hasattr(cls, "runtime"):
                assert isinstance(cls.runtime, ToolRuntime), f"{cls.__name__} runtime not set"

    def test_all_tool_determinism_set(self):
        for cls in self.TOOL_CLASSES:
            if hasattr(cls, "determinism"):
                assert isinstance(cls.determinism, Determinism), f"{cls.__name__} determinism not set"

    def test_all_estimate_cost_returns_float(self):
        for cls in self.TOOL_CLASSES:
            tool = cls()
            cost = tool.estimate_cost({"prompt": "test"})
            assert isinstance(cost, float), f"{tool.name} estimate_cost should return float"
            assert cost >= 0, f"{tool.name} estimate_cost should be >= 0"

    def test_all_get_info_contains_required_keys(self):
        required_keys = {
            "name",
            "version",
            "tier",
            "capability",
            "provider",
            "stability",
            "execution_mode",
            "determinism",
            "runtime",
            "dependencies",
            "capabilities",
            "best_for",
            "not_good_for",
            "resource_profile",
        }
        for cls in self.TOOL_CLASSES:
            tool = cls()
            info = tool.get_info()
            missing = required_keys - set(info.keys())
            assert not missing, f"{tool.name} missing info keys: {missing}"

    def test_all_resource_profile_full(self):
        for cls in self.TOOL_CLASSES:
            tool = cls()
            rp = tool.resource_profile
            assert isinstance(rp.cpu_cores, int) and rp.cpu_cores >= 0
            assert isinstance(rp.ram_mb, int) and rp.ram_mb >= 0
            assert isinstance(rp.disk_mb, int) and rp.disk_mb >= 0
