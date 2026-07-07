"""Tests for _shared.py — data dicts and pure functions."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from multi_publish.video_creation.base_tool import ToolResult, ToolStatus
from multi_publish.video_creation.providers.video._shared import (
    COGVIDEO_VARIANTS,
    HEYGEN_PROVIDERS,
    HUNYUAN_VARIANTS,
    LTX2_FRAME_COUNTS,
    LTX_LOCAL_VARIANTS,
    WAN_VARIANTS,
    estimate_local_runtime,
    estimate_quality_cost,
    estimate_speed_runtime,
    get_torch_device,
    local_generation_enabled,
    local_generation_status,
    local_install_instructions,
    probe_output,
)


# ──────────────────────────────────────────────
# Data dict completeness
# ──────────────────────────────────────────────

class TestHeygenProviders:
    def test_length(self):
        assert len(HEYGEN_PROVIDERS) == 13

    def test_all_have_required_keys(self):
        for key, val in HEYGEN_PROVIDERS.items():
            assert "name" in val, f"{key} missing name"
            assert "quality" in val, f"{key} missing quality"
            assert "speed" in val, f"{key} missing speed"

    def test_quality_values(self):
        valid = {"lowest", "low", "medium", "high", "highest"}
        for key, val in HEYGEN_PROVIDERS.items():
            assert val["quality"] in valid, f"{key} quality={val['quality']}"

    def test_speed_values(self):
        valid = {"fastest", "fast", "medium", "slow"}
        for key, val in HEYGEN_PROVIDERS.items():
            assert val["speed"] in valid, f"{key} speed={val['speed']}"


class TestWanVariants:
    def test_length(self):
        assert len(WAN_VARIANTS) == 2

    def test_wan21_1_3b_structure(self):
        v = WAN_VARIANTS["wan2.1-1.3b"]
        assert v["vram_mb"] == 8000
        assert v["quality"] == "high"
        assert v["t2v"] is True

    def test_wan21_14b_structure(self):
        v = WAN_VARIANTS["wan2.1-14b"]
        assert v["vram_mb"] == 24000
        assert v["quality"] == "highest"

    def test_all_have_required_keys(self):
        required = {"name", "hf_id", "pipeline_class", "vram_mb", "quality", "speed", "t2v", "i2v"}
        for key, val in WAN_VARIANTS.items():
            for r in required:
                assert r in val, f"{key} missing {r}"


class TestHunyuanVariants:
    def test_length(self):
        assert len(HUNYUAN_VARIANTS) == 1

    def test_hunyuan_1_5_structure(self):
        v = HUNYUAN_VARIANTS["hunyuan-1.5"]
        assert v["quality"] == "high"
        assert v["vram_mb"] == 14000


class TestLtxLocalVariants:
    def test_length(self):
        assert len(LTX_LOCAL_VARIANTS) == 1

    def test_ltx2_local_structure(self):
        v = LTX_LOCAL_VARIANTS["ltx2-local"]
        assert v["vram_mb"] == 12000
        assert v["quality"] == "high"


class TestCogvideoVariants:
    def test_length(self):
        assert len(COGVIDEO_VARIANTS) == 2

    def test_cogvideo_5b_structure(self):
        v = COGVIDEO_VARIANTS["cogvideo-5b"]
        assert v["vram_mb"] == 12000
        assert v["quality"] == "medium"

    def test_cogvideo_2b_structure(self):
        v = COGVIDEO_VARIANTS["cogvideo-2b"]
        assert v["vram_mb"] == 6000
        assert v["i2v"] is False


class TestLtx2FrameCounts:
    def test_length(self):
        assert len(LTX2_FRAME_COUNTS) == 7

    def test_known_durations(self):
        assert LTX2_FRAME_COUNTS["1s"] == 25
        assert LTX2_FRAME_COUNTS["5s"] == 121
        assert LTX2_FRAME_COUNTS["8s"] == 193


# ──────────────────────────────────────────────
# Pure functions
# ──────────────────────────────────────────────

class TestEstimateQualityCost:
    def test_highest(self):
        assert estimate_quality_cost("highest") == 0.50

    def test_high(self):
        assert estimate_quality_cost("high") == 0.35

    def test_low(self):
        assert estimate_quality_cost("low") == 0.15

    def test_medium_falls_to_default(self):
        assert estimate_quality_cost("medium") == 0.20

    def test_lowest_falls_to_default(self):
        assert estimate_quality_cost("lowest") == 0.20

    def test_unknown_returns_default(self):
        assert estimate_quality_cost("invalid") == 0.20


class TestEstimateSpeedRuntime:
    def test_slow_300(self):
        assert estimate_speed_runtime("slow") == 300

    def test_medium_120(self):
        assert estimate_speed_runtime("medium") == 120

    def test_fast_60(self):
        assert estimate_speed_runtime("fast") == 60

    def test_fastest_30(self):
        assert estimate_speed_runtime("fastest") == 30

    def test_unknown_returns_default_120(self):
        assert estimate_speed_runtime("nonexistent") == 120.0


class TestEstimateLocalRuntime:
    def test_slow_600(self):
        assert estimate_local_runtime("slow") == 600

    def test_medium_240(self):
        assert estimate_local_runtime("medium") == 240

    def test_fast_120(self):
        assert estimate_local_runtime("fast") == 120

    def test_unknown_returns_default_240(self):
        assert estimate_local_runtime("nonexistent") == 240.0


class TestGetTorchDevice:
    def test_no_torch_returns_cpu(self):
        with patch("builtins.__import__", side_effect=ImportError("no torch")):
            assert get_torch_device() == "cpu"

    def test_cuda_available(self):
        fake_torch = MagicMock()
        fake_torch.cuda.is_available.return_value = True
        orig_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

        def mock_import(name, *_args, **_kwargs):
            return fake_torch if name == "torch" else orig_import(name, *_args, **_kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            assert get_torch_device() == "cuda"

    def test_cpu_fallback(self):
        fake_torch = MagicMock()
        fake_torch.cuda.is_available.return_value = False
        fake_torch.backends.mps.is_available.return_value = False
        fake_torch.backends.mps.is_built.return_value = False
        orig_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

        def mock_import(name, *_args, **_kwargs):
            return fake_torch if name == "torch" else orig_import(name, *_args, **_kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            assert get_torch_device() == "cpu"


class TestLocalGeneration:
    def test_disabled_by_default(self):
        with patch.dict("os.environ", {}, clear=True):
            assert local_generation_enabled() is False

    def test_enabled_with_env_var(self):
        with patch.dict("os.environ", {"VIDEO_GEN_LOCAL_ENABLED": "true"}, clear=True):
            assert local_generation_enabled() is True

    def test_enabled_with_1(self):
        with patch.dict("os.environ", {"VIDEO_GEN_LOCAL_ENABLED": "1"}, clear=True):
            assert local_generation_enabled() is True

    def test_status_unavailable_when_disabled(self):
        with patch.dict("os.environ", {}, clear=True):
            assert local_generation_status() == ToolStatus.UNAVAILABLE

    def test_install_instructions(self):
        text = local_install_instructions()
        assert "pip install" in text
        assert "torch" in text
        assert "diffusers" in text


class TestProbeOutput:
    def test_without_ffprobe(self, tmp_path):
        f = tmp_path / "test.mp4"
        f.write_text("data")
        with patch("multi_publish.video_creation.providers.video._shared.shutil.which", return_value=None):
            result = probe_output(Path(str(f)))
        assert result["file_size_bytes"] == 4

    @patch("multi_publish.video_creation.providers.video._shared.shutil.which", return_value="/usr/bin/ffprobe")
    def test_ffprobe_success(self, mock_which, tmp_path):
        f = tmp_path / "test.mp4"
        f.write_text("x" * 2048)
        fake_json = json.dumps({
            "format": {"duration": "10.5"},
            "streams": [
                {"codec_type": "video", "width": 1920, "height": 1080, "codec_name": "h264"},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
        })
        with patch("multi_publish.video_creation.providers.video._shared.subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.returncode = 0
            mock_proc.stdout = fake_json
            mock_run.return_value = mock_proc
            result = probe_output(Path(str(f)))
        assert result["duration_seconds"] == 10.5
        assert result["video_width"] == 1920
        assert result["video_height"] == 1080
        assert result["video_codec"] == "h264"
        pass

    @patch("multi_publish.video_creation.providers.video._shared.shutil.which", return_value="/usr/bin/ffprobe")
    def test_ffprobe_failure(self, mock_which, tmp_path):
        f = tmp_path / "test.mp4"
        f.write_text("abc")
        with patch("multi_publish.video_creation.providers.video._shared.subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.returncode = 1
            mock_run.return_value = mock_proc
            result = probe_output(Path(str(f)))
        assert result["file_size_bytes"] == 3
        assert "duration_seconds" not in result