"""Tests for compose_utils.py -- pure utility functions."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from multi_publish.video_creation.providers.video.compose_utils import (
    build_atempo,
    build_subtitle_style,
    is_image,
    parse_probe_fps,
    read_text_file,
    tokenize,
)


class TestIsImage:
    """is_image() checks file extension."""

    @pytest.mark.parametrize("ext", [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"])
    def test_image_extensions(self, ext):
        assert is_image(Path("photo" + ext)) is True

    @pytest.mark.parametrize("ext", [".mp4", ".txt", ".pdf", ".gif", ".svg", "", ".GIF"])
    def test_non_image_extensions(self, ext):
        assert is_image(Path("file" + ext)) is False


class TestReadTextFile:
    """read_text_file() reads file content."""

    def test_reads_existing_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("hello world")
            f.flush()
            result = read_text_file(f.name)
            assert result == "hello world"

    def test_returns_none_for_none_path(self):
        assert read_text_file(None) is None

    def test_returns_none_for_missing_file(self):
        assert read_text_file("/nonexistent/file.txt") is None

    def test_accepts_path_object(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("path obj")
            f.flush()
            result = read_text_file(Path(f.name))
            assert result == "path obj"


class TestTokenize:
    """tokenize() splits and cleans text."""

    def test_simple_sentence(self):
        assert tokenize("Hello World") == ["hello", "world"]

    def test_with_punctuation(self):
        assert tokenize("Hello, World!") == ["hello", "world"]

    def test_numbers_and_hyphens(self):
        assert tokenize("test-123 abc") == ["test-123", "abc"]

    def test_empty_string(self):
        assert tokenize("") == []

    def test_only_special_chars(self):
        assert tokenize("!@#" + chr(36) + "%^*()") == []

    def test_mixed_case(self):
        assert tokenize("TeXt MiX") == ["text", "mix"]

    def test_unicode_chinese(self):
        result = tokenize("hello" + chr(20013) + chr(25991) + "world")
        assert result == ["hello", "world"]


class TestParseProbeFps:
    """parse_probe_fps() parses ffprobe FPS strings."""

    def test_fraction_format(self):
        assert parse_probe_fps("30000/1001") == 29.97

    def test_float_string(self):
        assert parse_probe_fps("29.97") == 29.97

    def test_integer_fraction(self):
        assert parse_probe_fps("60/1") == 60.0

    def test_zero_denominator_uses_one(self):
        """max(den, 1) prevents ZeroDivisionError, returns 10/1=10."""
        assert parse_probe_fps("10/0") == 10.0

    def test_invalid_string_returns_zero(self):
        assert parse_probe_fps("abc") == 0.0

    def test_empty_string_returns_zero(self):
        assert parse_probe_fps("") == 0.0

    def test_common_framerates(self):
        assert parse_probe_fps("24000/1001") == 23.98
        assert parse_probe_fps("25/1") == 25.0
        assert parse_probe_fps("50/1") == 50.0


class TestBuildSubtitleStyle:
    """build_subtitle_style() builds ASS style string."""

    def test_minimal_style(self):
        result = build_subtitle_style({})
        assert "FontName=Inter" in result
        assert "FontSize=28" in result
        assert "Bold=1" in result

    def test_custom_style(self):
        style = {"font": "Roboto", "font_size": 32, "bold": False,
                 "primary_color": "\u0026H00FFFFFF"}
        result = build_subtitle_style(style)
        assert "FontName=Roboto" in result
        assert "FontSize=32" in result
        assert "Bold=0" in result
        assert "\u0026H00FFFFFF" in result

    def test_custom_border_and_alignment(self):
        style = {"border_style": 3, "outline_width": 4, "shadow": 2,
                 "margin_v": 60, "alignment": 1}
        result = build_subtitle_style(style)
        assert "BorderStyle=3" in result
        assert "Outline=4" in result
        assert "Shadow=2" in result
        assert "MarginV=60" in result
        assert "Alignment=1" in result

    def test_returns_comma_separated(self):
        result = build_subtitle_style({"font": "Mono"})
        parts = result.split(",")
        assert len(parts) >= 3


class TestBuildAtempo:
    """build_atempo() builds FFmpeg atempo filter chain."""

    def test_normal_speed(self):
        assert build_atempo(1.0) == "atempo=1.0000"

    def test_double_speed(self):
        assert build_atempo(2.0) == "atempo=2.0000"

    def test_half_speed(self):
        assert build_atempo(0.5) == "atempo=0.5000"

    def test_fast_speed_chains(self):
        result = build_atempo(200.0)
        assert "atempo=100.0" in result

    def test_slow_speed_chains(self):
        result = build_atempo(0.25)
        assert "atempo=0.5" in result
