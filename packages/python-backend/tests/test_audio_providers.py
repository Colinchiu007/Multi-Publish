"""Tests for AI Audio/TTS/Music Integration Providers (Phase 3)."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import pytest

from multi_publish.video_creation.base_tool import (
    BaseTool,
    ToolResult,
    ToolTier,
    ToolStability,
    ToolStatus,
    ToolRuntime,
    ExecutionMode,
    Determinism,
    ResourceProfile,
)

from multi_publish.video_creation.providers.audio import (
    ElevenLabsTTS,
    OpenAITTS,
    DoubaoTTS,
    GoogleTTS,
    PiperTTS,
    TTSSelector,
    SunoMusic,
    PixabayMusic,
    FreesoundMusic,
    MusicLibrary,
    MusicGenerator,
    AudioSelector,
)

@pytest.fixture
def temp_output() -> Path:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        path = Path(f.name)
    yield path
    path.unlink(missing_ok=True)


@pytest.fixture
def sample_tts_inputs() -> dict[str, Any]:
    return {"text": "Hello, this is a test.", "output_path": "/tmp/test_tts.mp3"}


@pytest.fixture
def sample_music_inputs() -> dict[str, Any]:
    return {"prompt": "upbeat corporate background music", "duration_seconds": 30}


def _check_tool_metadata(tool: BaseTool):
    assert isinstance(tool.name, str) and tool.name, f"Tool {type(tool).__name__} missing name"
    assert isinstance(tool.capability, str) and tool.capability
    assert isinstance(tool.provider, str) and tool.provider
    assert isinstance(tool.tier, ToolTier)
    assert isinstance(tool.stability, ToolStability)
    assert isinstance(tool.execution_mode, ExecutionMode)
    assert isinstance(tool.determinism, Determinism)
    assert tool.version, f"Tool {tool.name} missing version"
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


def _check_execute_fails_without_key(tool: BaseTool, inputs: dict[str, Any]):
    result = tool.execute(inputs)
    assert isinstance(result, ToolResult)
    if tool.runtime == ToolRuntime.API:
        assert not result.success


def _check_dry_run(tool: BaseTool):
    result = tool.dry_run({"prompt": "test"})
    assert isinstance(result, dict)
    assert "tool" in result
    assert result["tool"] == tool.name
    assert "would_execute" in result


def _check_idempotency(tool: BaseTool):
    """Test that idempotency keys are consistent for same inputs, different for different inputs."""
    if not tool.idempotency_key_fields:
        pytest.skip(f"{tool.name} has no idempotency_key_fields")
    fields = tool.idempotency_key_fields
    # Build two different input sets
    inputs_a = {f: f"val_{f}" for f in fields}
    inputs_b = dict(inputs_a)
    inputs_b[fields[0]] = f"val_{fields[0]}_different"
    k1 = tool.idempotency_key(inputs_a)
    k2 = tool.idempotency_key(inputs_a)
    k3 = tool.idempotency_key(inputs_b)
    assert k1 == k2
    assert k1 != k3


class TestElevenLabsTTS:
    def setup_method(self):
        self.tool = ElevenLabsTTS()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self):
        os.environ.pop("ELEVENLABS_API_KEY", None)
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_execute_fails_without_key(self, sample_tts_inputs):
        os.environ.pop("ELEVENLABS_API_KEY", None)
        _check_execute_fails_without_key(self.tool, sample_tts_inputs)

    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)

    def test_estimate_cost(self):
        cost = self.tool.estimate_cost({"text": "Hello world"})
        assert isinstance(cost, float) and cost > 0

    def test_tier_is_voice(self):
        assert self.tool.tier == ToolTier.VOICE

    def test_resource_profile(self):
        assert self.tool.resource_profile.network_required is True


class TestOpenAITTS:
    def setup_method(self):
        self.tool = OpenAITTS()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self):
        os.environ.pop("OPENAI_API_KEY", None)
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_execute_fails_without_key(self, sample_tts_inputs):
        os.environ.pop("OPENAI_API_KEY", None)
        _check_execute_fails_without_key(self.tool, sample_tts_inputs)

    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)

    def test_estimate_cost(self):
        assert self.tool.estimate_cost({"text": "Hello"}) >= 0

    def test_supports_instructions(self):
        assert self.tool._supports_instructions("gpt-4o-mini-tts") is True
        assert self.tool._supports_instructions("tts-1") is False


class TestDoubaoTTS:
    def setup_method(self):
        self.tool = DoubaoTTS()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self):
        os.environ.pop("DOUBAO_SPEECH_API_KEY", None)
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_execute_fails_without_key(self, sample_tts_inputs):
        os.environ.pop("DOUBAO_SPEECH_API_KEY", None)
        _check_execute_fails_without_key(self.tool, sample_tts_inputs)

    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)

    def test_async_execution_mode(self):
        assert self.tool.execution_mode == ExecutionMode.ASYNC

    def test_extension_for_format(self):
        assert self.tool._extension_for_format("ogg_opus") == "ogg"
        assert self.tool._extension_for_format("pcm") == "pcm"
        assert self.tool._extension_for_format("mp3") == "mp3"

    def test_diagnostic_hints(self):
        hint = self.tool._diagnostic_hint("load grant error")
        assert "check" in hint.lower() and "api_key" in hint.lower()
        hint2 = self.tool._diagnostic_hint("quota exceeded")
        assert "quota" in hint2.lower()

    def test_safe_error_redacts_key(self):
        os.environ["DOUBAO_SPEECH_API_KEY"] = "secret123"
        exc = ValueError("error with secret123 in it")
        safe = self.tool._safe_error(exc)
        assert "secret123" not in safe and "[redacted]" in safe
        del os.environ["DOUBAO_SPEECH_API_KEY"]

    def test_cost_from_usage(self):
        assert self.tool._cost_from_usage({"text_words": 100}) == 0.0015
        assert self.tool._cost_from_usage({}) is None
        assert self.tool._cost_from_usage(None) is None


class TestGoogleTTS:
    def setup_method(self):
        self.tool = GoogleTTS()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self):
        os.environ.pop("GOOGLE_API_KEY", None); os.environ.pop("GEMINI_API_KEY", None)
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_execute_fails_without_key(self, sample_tts_inputs):
        os.environ.pop("GOOGLE_API_KEY", None); os.environ.pop("GEMINI_API_KEY", None)
        _check_execute_fails_without_key(self.tool, sample_tts_inputs)

    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)
    def test_stability_beta(self): assert self.tool.stability == ToolStability.BETA

    def test_needs_beta_api(self):
        assert self.tool._needs_beta_api("en-US-Chirp3-HD-Orus") is True
        assert self.tool._needs_beta_api("en-US-Neural2-D") is False

    def test_estimate_cost(self):
        assert self.tool.estimate_cost({"text": "Hello", "voice": "en-US-Chirp3-HD-Orus"}) > 0

    def test_get_api_key(self):
        os.environ["GOOGLE_API_KEY"] = "test-key"
        assert self.tool._get_api_key() == "test-key"
        del os.environ["GOOGLE_API_KEY"]


class TestPiperTTS:
    def setup_method(self):
        self.tool = PiperTTS()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)
    def test_local_runtime(self): assert self.tool.runtime == ToolRuntime.LOCAL
    def test_offline_capability(self): assert "offline_generation" in self.tool.capabilities
    def test_estimate_cost_zero(self): assert self.tool.estimate_cost({}) == 0.0
    def test_resource_profile_low(self):
        rp = self.tool.resource_profile
        assert rp.network_required is False and rp.cpu_cores >= 1


class TestSunoMusic:
    def setup_method(self):
        self.tool = SunoMusic()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self):
        os.environ.pop("SUNO_API_KEY", None)
        assert self.tool.get_status() == ToolStatus.UNAVAILABLE

    def test_execute_fails_without_key(self, sample_music_inputs):
        os.environ.pop("SUNO_API_KEY", None)
        _check_execute_fails_without_key(self.tool, sample_music_inputs)

    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)
    def test_beta_stability(self): assert self.tool.stability == ToolStability.BETA
    def test_estimate_cost(self): assert self.tool.estimate_cost({}) == 0.05


class TestPixabayMusic:
    def setup_method(self):
        self.tool = PixabayMusic()

    def test_metadata(self): _check_tool_metadata(self.tool)
    def test_get_info(self): _check_get_info(self.tool)
    def test_get_status(self): assert self.tool.get_status() == ToolStatus.AVAILABLE
    def test_dry_run(self): _check_dry_run(self.tool)
    def test_idempotency(self): _check_idempotency(self.tool)
    def test_estimate_cost_zero(self): assert self.tool.estimate_cost({}) == 0.0
    def test_experimental_stability(self): assert self.tool.stability == ToolStability.EXPERIMENTAL

    def test_execute_fails_without_query(self):
        result = self.tool.execute({})
        assert not result.success

    def test_parse_tracks_html_empty(self):
        assert self.tool._parse_tracks_html("<html></html>") == []

    def test_parse_tracks_html_with_mp3(self):
        html = '<a href="https://cdn.pixabay.com/audio/test123.mp3">link</a>'
        tracks = self.tool._parse_tracks_html(html)
        assert len(tracks) == 1
        assert tracks[0]["audio_url"] == "https://cdn.pixabay.com/audio/test123.mp3"
