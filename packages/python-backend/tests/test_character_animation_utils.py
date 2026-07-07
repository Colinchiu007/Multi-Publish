"""Tests for character_animation_utils.py -- pure utility functions."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from multi_publish.video_creation.character.character_animation_utils import (
    _character_color,
    _normalize_style,
    _slug,
    _write_json,
)


class TestSlug:
    """_slug() converts strings to URL-safe slugs."""

    def test_simple_text(self):
        assert _slug("Hello World") == "hello-world"

    def test_special_chars_removed(self):
        """Non-alphanumeric chars become hyphens, trailing stripped."""
        assert _slug("Hello! @World#") == "hello---world"

    def test_leading_trailing_whitespace(self):
        assert _slug("  Hello  ") == "hello"

    def test_multiple_hyphens_collapsed(self):
        """Note: _slug does NOT collapse multiple hyphens."""
        assert _slug("a---b---c") == "a---b---c"

    def test_empty_string_returns_character(self):
        assert _slug("") == "character"

    def test_alphanumeric_only(self):
        assert _slug("abc123") == "abc123"

    def test_unicode_removed(self):
        slug = _slug("cafe" + chr(769))
        assert slug == "cafe"


class TestCharacterColor:
    """_character_color() returns deterministic color pairs."""

    def test_index_0(self):
        primary, secondary = _character_color(0)
        assert primary == "#ff8f68"
        assert secondary == "#ffd39f"

    def test_index_1(self):
        primary, secondary = _character_color(1)
        assert primary == "#75b8ff"
        assert secondary == "#ffe7a3"

    def test_index_2(self):
        primary, secondary = _character_color(2)
        assert primary == "#8fd17f"
        assert secondary == "#f7c8ff"

    def test_index_3(self):
        primary, secondary = _character_color(3)
        assert primary == "#f2c94c"
        assert secondary == "#fce6c9"

    def test_index_wraps_after_4(self):
        p0, s0 = _character_color(0)
        p4, s4 = _character_color(4)
        assert p4 == p0
        assert s4 == s0

    def test_index_wraps_after_8(self):
        p0, s0 = _character_color(0)
        p8, s8 = _character_color(8)
        assert p8 == p0
        assert s8 == s0

    def test_negative_index(self):
        p0, s0 = _character_color(0)
        p_neg, s_neg = _character_color(-4)
        assert p_neg == p0
        assert s_neg == s0


class TestNormalizeStyle:
    """_normalize_style() normalizes style dicts."""

    def test_empty_dict(self):
        assert _normalize_style({}) == {}

    def test_none_returns_empty(self):
        assert _normalize_style(None) == {}

    def test_non_dict_returns_empty(self):
        assert _normalize_style("string") == {}

    def test_visual_style_key(self):
        result = _normalize_style({"visual_style": "anime"})
        assert result == {"visual_style": "anime"}

    def test_name_key(self):
        result = _normalize_style({"name": "cartoon"})
        assert result == {"visual_style": "cartoon"}

    def test_style_key(self):
        result = _normalize_style({"style": "sketch"})
        assert result == {"visual_style": "sketch"}

    def test_palette_list(self):
        result = _normalize_style({"visual_style": "anime", "palette": ["#FF0000", "#00FF00"]})
        assert result["palette"] == ["#FF0000", "#00FF00"]

    def test_line_style(self):
        result = _normalize_style({"visual_style": "manga", "line_style": "bold"})
        assert result["line_style"] == "bold"

    def test_texture(self):
        result = _normalize_style({"visual_style": "oil", "texture": "canvas"})
        assert result["texture"] == "canvas"

    def test_visual_style_precedes_name(self):
        result = _normalize_style({"visual_style": "anime", "name": "cartoon"})
        assert result["visual_style"] == "anime"


class TestWriteJson:
    """_write_json() writes JSON to file."""

    def test_writes_to_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "test.json")
            result = _write_json(path, {"key": "value"})
            assert len(result) == 1
            content = json.loads(Path(path).read_text(encoding="utf-8"))
            assert content == {"key": "value"}

    def test_returns_empty_for_none_path(self):
        assert _write_json(None, {"key": "value"}) == []

    def test_creates_parent_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "sub" / "nested" / "test.json")
            result = _write_json(path, {"a": 1})
            assert len(result) == 1
            assert Path(path).exists()
