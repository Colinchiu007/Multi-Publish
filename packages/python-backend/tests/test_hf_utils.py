"""Tests for hf_utils.py — pure utility functions."""

from __future__ import annotations

from pathlib import Path

from multi_publish.video_creation.providers.video.hf_utils import (
    _f,
    compute_total_duration,
    escape_text,
    is_inside,
    parse_json_output,
)


class TestF:
    """_f() formats floats for CSS."""

    def test_integer_value(self):
        assert _f(5.0) == "5"

    def test_decimal_value(self):
        assert _f(5.50) == "5.5"

    def test_precise_value(self):
        assert _f(3.14) == "3.14"

    def test_zero(self):
        assert _f(0.0) == "0"

    def test_negative(self):
        assert _f(-1.5) == "-1.5"


class TestEscapeText:
    """escape_text() escapes HTML entities."""

    def test_no_special_chars(self):
        assert escape_text("hello world") == "hello world"

    def test_ampersand(self):
        assert escape_text("a" + chr(38) + "b") == "a" + chr(38) + "amp;b"

    def test_less_than(self):
        assert escape_text("a" + chr(60) + "b") == "a" + chr(38) + "lt;b"

    def test_greater_than(self):
        assert escape_text("a" + chr(62) + "b") == "a" + chr(38) + "gt;b"

    def test_quotes(self):
        assert escape_text("a" + chr(34) + "b") == "a" + chr(38) + "quot;b"

    def test_all_special(self):
        result = escape_text("<script>alert(\"x\")</script>")
        assert "lt;script" in result
        assert "quot;x" in result

    def test_empty_string(self):
        assert escape_text("") == ""


class TestParseJsonOutput:
    """parse_json_output() parses first JSON object from stdout."""

    def test_simple_json(self):
        assert parse_json_output('{"key": "value"}') == {"key": "value"}

    def test_json_with_prefix_lines(self):
        result = parse_json_output("some log\n{\"a\": 1}\nmore text")
        assert result == {"a": 1}

    def test_no_json_returns_none(self):
        assert parse_json_output("just text") is None

    def test_empty_string(self):
        assert parse_json_output("") is None

    def test_multiple_objects_returns_first(self):
        result = parse_json_output('{"a": 1}\n{"b": 2}')
        assert result == {"a": 1}


class TestComputeTotalDuration:
    """compute_total_duration() sums cut durations."""

    def test_all_have_duration(self):
        cuts = [{"duration": 5.0}, {"duration": 3.0}, {"duration": 2.0}]
        assert compute_total_duration(cuts) == 10.0

    def test_falls_back_to_end(self):
        cuts = [{"duration": 5.0}, {"end": 3.0}, {"duration": 2.0}]
        assert compute_total_duration(cuts) == 10.0

    def test_uses_zero_if_missing(self):
        cuts = [{"duration": 5.0}, {}]
        assert compute_total_duration(cuts) == 5.0

    def test_empty_list(self):
        assert compute_total_duration([]) == 0.0


class TestIsInside:
    """is_inside() checks path containment."""

    def test_path_inside_root(self):
        root = Path("/home/project")
        path = Path("/home/project/sub/file.txt")
        assert is_inside(path, root) is True

    def test_path_outside_root(self):
        root = Path("/home/project")
        path = Path("/home/other/file.txt")
        assert is_inside(path, root) is False

    def test_path_is_root(self):
        root = Path("/home/project")
        assert is_inside(root, root) is True
