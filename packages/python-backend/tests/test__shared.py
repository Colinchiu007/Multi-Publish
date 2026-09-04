"""Tests for _shared.py — data dicts and pure functions."""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest

from multi_publish.video_creation.base_tool import ToolStatus
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
    generate_heygen_video,
    generate_ltx_modal_video,
    get_torch_device,
    local_generation_enabled,
    local_generation_status,
    local_install_instructions,
    poll_heygen,
    probe_output,
    upload_image_fal,
    upload_image_heygen,
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

# ??????????????????????????????????????????????
# poll_heygen (respx mock for httpx)
# ??????????????????????????????????????????????

class TestPollHeygen:
    def test_completed_returns_video_url(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "completed", "output": {"video_url": "https://cdn.heygen.com/video.mp4"}}}
        )
        result = poll_heygen("exec_123", "test_key", timeout=10)
        assert result == "https://cdn.heygen.com/video.mp4"

    def test_completed_output_video_key(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "completed", "output": {"video": {"video_url": "https://cdn.heygen.com/v2.mp4"}}}}
        )
        result = poll_heygen("exec_123", "test_key", timeout=10)
        assert result == "https://cdn.heygen.com/v2.mp4"

    def test_failed_status_raises(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "failed", "error": "Model error"}}
        )
        with pytest.raises(RuntimeError, match="failed"):
            poll_heygen("exec_123", "test_key", timeout=10)

    def test_completed_no_video_url_raises(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "completed", "output": {}}}
        )
        with pytest.raises(RuntimeError, match="no video_url"):
            poll_heygen("exec_123", "test_key", timeout=10)

    def test_http_error_raises(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(status_code=401)
        with pytest.raises(Exception):  # noqa: B017
            poll_heygen("exec_123", "test_key", timeout=10)

    def test_timeout_after_deadline(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "processing"}}
        )
        with pytest.raises(TimeoutError, match="timed out"):
            poll_heygen("exec_123", "test_key", timeout=0)

    @patch("multi_publish.video_creation.providers.video._shared.time.sleep")
    def test_processing_then_completed(self, mock_sleep, respx_mock):
        route = respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123")
        route.side_effect = [
            httpx.Response(200, json={"data": {"status": "processing"}}),
            httpx.Response(200, json={"data": {"status": "completed", "output": {"video_url": "https://cdn.heygen.com/final.mp4"}}}),
        ]
        result = poll_heygen("exec_123", "test_key", timeout=30)
        assert result == "https://cdn.heygen.com/final.mp4"
        assert route.call_count == 2

    def test_error_status_raises(self, respx_mock):
        respx_mock.get("https://api.heygen.com/v1/workflows/executions/exec_123").respond(
            json={"data": {"status": "error", "error": "Internal error"}}
        )
        with pytest.raises(RuntimeError, match="failed"):
            poll_heygen("exec_123", "test_key", timeout=10)


class TestUploadImageFal:
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_api_key(self):
        with pytest.raises(RuntimeError, match="FAL_KEY or FAL_AI_API_KEY"):
            upload_image_fal("/tmp/nonexistent.png")

    @patch.dict(os.environ, {"FAL_KEY": "test_fal_key"})
    @patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=False)
    def test_file_not_found(self, mock_exists):
        with pytest.raises(FileNotFoundError, match="not found"):
            upload_image_fal("/tmp/nonexistent.png")

    @patch.dict(os.environ, {"FAL_KEY": "test_fal_key"})
    def test_successful_upload(self, respx_mock):
        respx_mock.post("https://rest.alpha.fal.ai/storage/upload/initiate").respond(
            json={"upload_url": "https://fal.ai/upload/abc", "file_url": "https://fal.ai/files/test.png"}
        )
        respx_mock.put("https://fal.ai/upload/abc").respond(status_code=200)
        with (
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"fake_image_bytes"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".png"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "test.png"),
        ):
            result = upload_image_fal("/tmp/test.png")
        assert result == "https://fal.ai/files/test.png"

    @patch.dict(os.environ, {"FAL_AI_API_KEY": "fallback_key"})
    def test_fallback_api_key_env(self, respx_mock):
        respx_mock.post("https://rest.alpha.fal.ai/storage/upload/initiate").respond(
            json={"upload_url": "https://fal.ai/upload/xyz", "file_url": "https://fal.ai/files/photo.jpg"}
        )
        respx_mock.put("https://fal.ai/upload/xyz").respond(status_code=200)
        with (
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".jpg"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "photo.jpg"),
        ):
            result = upload_image_fal("/tmp/photo.jpg")
        assert result == "https://fal.ai/files/photo.jpg"

    @patch.dict(os.environ, {"FAL_KEY": "test_key"})
    def test_webp_content_type(self, respx_mock):
        respx_mock.post("https://rest.alpha.fal.ai/storage/upload/initiate").respond(
            json={"upload_url": "https://fal.ai/upload/webp", "file_url": "https://fal.ai/files/img.webp"}
        )
        respx_mock.put("https://fal.ai/upload/webp").respond(status_code=200)
        with (
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".webp"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "img.webp"),
        ):
            upload_image_fal("/tmp/img.webp")


class TestUploadImageHeygen:
    @patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=False)
    def test_file_not_found(self, mock_exists):
        with pytest.raises(FileNotFoundError, match="not found"):
            upload_image_heygen("/tmp/nonexistent.png", "test_key")

    def test_v2_success(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v2/assets/upload").respond(
            json={"data": {"upload_url": "https://heygen.com/upload/abc", "url": "https://heygen.com/files/test.png"}}
        )
        respx_mock.put("https://heygen.com/upload/abc").respond(status_code=200)
        with (
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".png"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "test.png"),
        ):
            result = upload_image_heygen("/tmp/test.png", "test_key")
        assert result == "https://heygen.com/files/test.png"

    def test_v2_404_fallback_to_fal(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v2/assets/upload").respond(status_code=404)
        respx_mock.post("https://rest.alpha.fal.ai/storage/upload/initiate").respond(
            json={"upload_url": "https://fal.ai/upload/fallback", "file_url": "https://fal.ai/files/fallback.png"}
        )
        respx_mock.put("https://fal.ai/upload/fallback").respond(status_code=200)
        with (
            patch.dict(os.environ, {"FAL_KEY": "fal_fallback_key"}),
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".png"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "test.png"),
        ):
            result = upload_image_heygen("/tmp/test.png", "test_key")
        assert result == "https://fal.ai/files/fallback.png"

    def test_v2_500_fallback_to_fal(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v2/assets/upload").respond(status_code=500)
        respx_mock.post("https://rest.alpha.fal.ai/storage/upload/initiate").respond(
            json={"upload_url": "https://fal.ai/upload/fb", "file_url": "https://fal.ai/files/fb.png"}
        )
        respx_mock.put("https://fal.ai/upload/fb").respond(status_code=200)
        with (
            patch.dict(os.environ, {"FAL_KEY": "fal_fb"}),
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.suffix", new_callable=lambda: ".png"),
            patch("multi_publish.video_creation.providers.video._shared.Path.name", new_callable=lambda: "test.png"),
        ):
            result = upload_image_heygen("/tmp/test.png", "test_key")
        assert result == "https://fal.ai/files/fb.png"

# -----------------------------------------------
# generate_heygen_video
# -----------------------------------------------

class TestGenerateHeygenVideo:
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_api_key(self):
        result = generate_heygen_video({"prompt": "test"})
        assert result.success is False
        assert "HEYGEN_API_KEY" in result.error

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_unknown_provider_variant(self):
        result = generate_heygen_video({"prompt": "test", "provider_variant": "nonexistent"})
        assert result.success is False
        assert "Unknown provider_variant" in result.error

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_image_to_video_no_ref(self):
        result = generate_heygen_video({"prompt": "test", "provider_variant": "veo_3_1", "operation": "image_to_video"})
        assert result.success is False
        assert "requires" in result.error

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_no_execution_id(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v1/workflows/executions").respond(json={"data": {}})
        result = generate_heygen_video({"prompt": "test", "provider_variant": "veo_3_1"})
        assert result.success is False
        assert "execution_id" in result.error

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_text_to_video_success(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v1/workflows/executions").respond(
            json={"data": {"execution_id": "exec_456"}}
        )
        with patch("multi_publish.video_creation.providers.video._shared.poll_heygen", return_value="https://cdn.heygen.com/video.mp4"):
            respx_mock.get("https://cdn.heygen.com/video.mp4").respond(content=b"fake_video_bytes")
            result = generate_heygen_video({"prompt": "test", "provider_variant": "veo_3_1"})
        assert result.success is True
        assert result.data["execution_id"] == "exec_456"
        assert result.data["mode"] == "api"

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_image_to_video_with_ref_url(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v1/workflows/executions").respond(
            json={"data": {"execution_id": "exec_789"}}
        )
        with patch("multi_publish.video_creation.providers.video._shared.poll_heygen", return_value="https://cdn.heygen.com/v2.mp4"):
            respx_mock.get("https://cdn.heygen.com/v2.mp4").respond(content=b"data")
            result = generate_heygen_video({
                "prompt": "test", "provider_variant": "veo_3_1",
                "operation": "image_to_video", "reference_image_url": "https://example.com/img.png"
            })
        assert result.success is True
        assert result.data["operation"] == "image_to_video"

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    @patch("multi_publish.video_creation.providers.video._shared.upload_image_heygen", return_value="https://heygen.com/uploaded.png")
    def test_image_to_video_with_ref_path(self, mock_upload, respx_mock):
        respx_mock.post("https://api.heygen.com/v1/workflows/executions").respond(
            json={"data": {"execution_id": "exec_101"}}
        )
        with patch("multi_publish.video_creation.providers.video._shared.poll_heygen", return_value="https://cdn.heygen.com/v3.mp4"):
            respx_mock.get("https://cdn.heygen.com/v3.mp4").respond(content=b"data")
            result = generate_heygen_video({
                "prompt": "test", "provider_variant": "veo_3_1",
                "operation": "image_to_video", "reference_image_path": "/tmp/img.png"
            })
        assert result.success is True
        mock_upload.assert_called_once_with("/tmp/img.png", "test_key")

    @patch.dict(os.environ, {"HEYGEN_API_KEY": "test_key"})
    def test_http_error_raises(self, respx_mock):
        respx_mock.post("https://api.heygen.com/v1/workflows/executions").respond(status_code=401)
        with pytest.raises(Exception):  # noqa: B017
            generate_heygen_video({"prompt": "test", "provider_variant": "veo_3_1"})


# -----------------------------------------------
# generate_ltx_modal_video
# -----------------------------------------------

class TestGenerateLtxModalVideo:
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_endpoint_url(self):
        result = generate_ltx_modal_video({"prompt": "test"})
        assert result.success is False
        assert "MODAL_LTX2_ENDPOINT_URL" in result.error

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_image_to_video_no_ref(self):
        result = generate_ltx_modal_video({"prompt": "test", "operation": "image_to_video"})
        assert result.success is False
        assert "requires" in result.error

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_text_to_video_direct_video(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            content=b"fake_mp4_data", headers={"content-type": "video/mp4"}
        )
        with patch("multi_publish.video_creation.providers.video._shared.Path.write_bytes"):
            result = generate_ltx_modal_video({"prompt": "test"})
        assert result.success is True
        assert result.data["provider"] == "ltx-modal"

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_text_to_video_json_response(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            json={"video_url": "https://modal.example.com/video.mp4"}
        )
        respx_mock.get("https://modal.example.com/video.mp4").respond(content=b"data")
        with patch("multi_publish.video_creation.providers.video._shared.Path.write_bytes"):
            result = generate_ltx_modal_video({"prompt": "test"})
        assert result.success is True

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_image_to_video_with_ref_path(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            content=b"data", headers={"content-type": "video/mp4"}
        )
        with (
            patch("multi_publish.video_creation.providers.video._shared.Path.exists", return_value=True),
            patch("multi_publish.video_creation.providers.video._shared.Path.read_bytes", return_value=b"img_data"),
            patch("multi_publish.video_creation.providers.video._shared.Path.write_bytes"),
        ):
            result = generate_ltx_modal_video({
                "prompt": "test", "operation": "image_to_video",
                "reference_image_path": "/tmp/img.png"
            })
        assert result.success is True

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_image_to_video_with_ref_url(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            content=b"data", headers={"content-type": "video/mp4"}
        )
        with patch("multi_publish.video_creation.providers.video._shared.Path.write_bytes"):
            result = generate_ltx_modal_video({
                "prompt": "test", "operation": "image_to_video",
                "reference_image_url": "https://example.com/img.png"
            })
        assert result.success is True

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_square_aspect_ratio(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            content=b"data", headers={"content-type": "video/mp4"}
        )
        with patch("multi_publish.video_creation.providers.video._shared.Path.write_bytes"):
            result = generate_ltx_modal_video({"prompt": "test", "aspect_ratio": "1:1"})
        assert result.success is True

    @patch.dict(os.environ, {"MODAL_LTX2_ENDPOINT_URL": "https://modal.example.com/generate"})
    def test_json_no_video_url(self, respx_mock):
        respx_mock.post("https://modal.example.com/generate").respond(
            json={"status": "error"}
        )
        result = generate_ltx_modal_video({"prompt": "test"})
        assert result.success is False
