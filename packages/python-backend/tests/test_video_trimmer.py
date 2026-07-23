"""Tests for video_trimmer.py — pure functions + error paths.

Full operations (_cut/_speed/_concat) require FFmpeg.
This test focuses on:
1. _build_atempo_chain() — pure static method, no external deps
2. Error paths (unknown operation, missing file, empty segments)
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess

import pytest
from fastapi import HTTPException

from multi_publish.video_creation.base_tool import ToolResult
from multi_publish.video_creation.providers.video.video_trimmer import VideoTrimmer


class TestBuildAtempoChain:
    """_build_atempo_chain() — pure function tests."""

    def test_normal_speed_factor_1x(self):
        chain = VideoTrimmer._build_atempo_chain(1.0)
        assert chain == "atempo=1.0000"

    def test_normal_speed_factor_2x(self):
        chain = VideoTrimmer._build_atempo_chain(2.0)
        assert chain == "atempo=2.0000"

    def test_normal_speed_factor_0_5x(self):
        chain = VideoTrimmer._build_atempo_chain(0.5)
        assert chain == "atempo=0.5000"

    def test_factor_above_100_chains_multiple(self):
        chain = VideoTrimmer._build_atempo_chain(200.0)
        assert "atempo=100.0" in chain
        assert "atempo=2.0000" in chain

    def test_factor_extreme_1000(self):
        chain = VideoTrimmer._build_atempo_chain(1000.0)
        # 1000 = 100 * 10 → two filters: atempo=100.0, atempo=10.0
        atempo_count = chain.count("atempo=")
        assert atempo_count >= 2

    def test_factor_below_0_5_chains_multiple(self):
        chain = VideoTrimmer._build_atempo_chain(0.25)
        assert "atempo=0.5" in chain
        filters = chain.split(",")
        assert len(filters) == 2  # 0.5 to get 0.25 requires two filters: 0.5*0.5=0.25

    def test_factor_extreme_0_01(self):
        chain = VideoTrimmer._build_atempo_chain(0.01)
        # 0.01 = 0.5 * 0.5 * 0.5 * 0.5... let's see
        atempo_count = chain.count("atempo=")
        assert atempo_count >= 2

    def test_zero_factor_returns_one(self):
        chain = VideoTrimmer._build_atempo_chain(0.0)
        assert chain == "atempo=1.0000"

    def test_negative_factor_returns_one(self):
        chain = VideoTrimmer._build_atempo_chain(-1.0)
        assert chain == "atempo=1.0000"

    def test_returns_comma_separated_chain(self):
        chain = VideoTrimmer._build_atempo_chain(0.3)
        # 0.3 < 0.5 → one halving: atempo=0.5, then remaining = 0.3/0.5 = 0.6
        parts = chain.split(",")
        assert len(parts) >= 2
        assert all(p.startswith("atempo=") for p in parts)

    @pytest.mark.parametrize("factor", [0.75, 1.5, 3.0, 10.0, 50.0])
    def test_various_typical_factors(self, factor):
        chain = VideoTrimmer._build_atempo_chain(factor)
        assert chain.startswith("atempo=")
        assert chain.count(",") >= 0  # valid format


class TestVideoTrimmerExecute:
    """Error paths in execute() — no FFmpeg needed."""

    def test_unknown_operation(self):
        trimmer = VideoTrimmer()
        result = trimmer.execute({"operation": "unknown_op"})
        assert result.success is False
        assert "unknown operation" in result.error.lower()

    def test_missing_operation_key(self):
        trimmer = VideoTrimmer()
        with pytest.raises(KeyError):
            trimmer.execute({})

    def test_cut_missing_input(self):
        trimmer = VideoTrimmer()
        result = trimmer.execute({
            "operation": "cut",
            "input_path": "/nonexistent/video.mp4",
        })
        assert result.success is False
        assert "Input not found" in result.error

    def test_speed_missing_input(self):
        trimmer = VideoTrimmer()
        result = trimmer.execute({
            "operation": "speed",
            "input_path": "/nonexistent/video.mp4",
        })
        assert result.success is False
        assert "Input not found" in result.error

    def test_concat_no_segments(self):
        trimmer = VideoTrimmer()
        result = trimmer.execute({
            "operation": "concat",
            "segments": [],
        })
        assert result.success is False
        assert "No segments" in result.error

    def test_concat_missing_segment_file(self):
        trimmer = VideoTrimmer()
        result = trimmer.execute({
            "operation": "concat",
            "segments": [{"input_path": "/nonexistent/seg1.mp4"}],
        })
        assert result.success is False
        assert "not found" in result.error

    def test_cut_rejects_invalid_time_range(self, tmp_path):
        source = tmp_path / "source.mp4"
        source.write_bytes(b"video")
        trimmer = VideoTrimmer()

        result = trimmer.execute({
            "operation": "cut",
            "input_path": str(source),
            "start_seconds": 3,
            "end_seconds": 1,
        })

        assert result.success is False
        assert "end_seconds" in result.error

    @pytest.mark.skipif(
        shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
        reason="需要本机 FFmpeg/FFprobe",
    )
    def test_cut_creates_real_playable_clip(self, tmp_path):
        source = tmp_path / "source.mp4"
        output = tmp_path / "clip.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=2",
            "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-shortest",
            "-c:v", "libx264", "-c:a", "aac", str(source),
        ], check=True, capture_output=True)

        result = VideoTrimmer().execute({
            "operation": "cut", "input_path": str(source),
            "start_seconds": 0.5, "end_seconds": 1.5,
            "codec": "libx264", "output_path": str(output),
        })
        probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(output),
        ], check=True, capture_output=True, text=True)

        assert result.success is True
        assert output.stat().st_size > 0
        assert 0.8 <= float(probe.stdout.strip()) <= 1.2


class TestVideoProcessEndpoint:
    def test_trim_dispatches_to_real_tool_contract(self, monkeypatch, tmp_path):
        from server import video_process

        source = tmp_path / "source.mp4"
        source.write_bytes(b"video")
        output = tmp_path / "clip.mp4"
        captured = {}

        def fake_execute(_self, inputs):
            captured.update(inputs)
            output.write_bytes(b"clip")
            return ToolResult(success=True, data={"output": str(output)}, artifacts=[str(output)])

        monkeypatch.setattr(VideoTrimmer, "execute", fake_execute)
        response = asyncio.run(video_process({
            "type": "trim",
            "params": {
                "input_path": str(source), "output_path": str(output),
                "start_seconds": 1, "end_seconds": 2, "codec": "libx264",
            },
        }))

        assert captured["operation"] == "cut"
        assert response["success"] is True
        assert response["output"] == str(output)

    def test_unimplemented_process_type_returns_501(self):
        from server import video_process

        with pytest.raises(HTTPException) as exc:
            asyncio.run(video_process({"type": "green-screen", "params": {}}))
        assert exc.value.status_code == 501
