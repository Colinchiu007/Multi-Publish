"""Tests for hyperframes_style_bridge.py — pure CSS/design generation."""

from __future__ import annotations

import pytest

from multi_publish.video_creation.providers.video.lib.hyperframes_style_bridge import (
    style_bridge,
    _first,
    _font,
    _motion_easing,
    _render_design_md,
    _FALLBACK_CSS_VARS,
)


class TestFirst:
    """_first() helper extracts first value from palette entries."""

    def test_list_returns_first(self):
        assert _first(["#FFF", "#000"], "#000") == "#FFF"

    def test_single_string(self):
        assert _first("#FFF", "#000") == "#FFF"

    def test_empty_list(self):
        assert _first([], "#000") == "#000"

    def test_none(self):
        assert _first(None, "#000") == "#000"

    def test_empty_string(self):
        assert _first("", "#000") == "#000"


class TestFont:
    """_font() extracts font family from typography block."""

    def test_dict_with_font(self):
        assert _font({"heading": {"font": "Roboto"}}, "heading", "Inter") == "Roboto"

    def test_dict_with_family(self):
        assert _font({"body": {"family": "Noto Sans"}}, "body", "Inter") == "Noto Sans"

    def test_string_value(self):
        assert _font({"heading": "Mono"}, "heading", "Inter") == "Mono"

    def test_empty_dict(self):
        assert _font({"heading": {}}, "heading", "Inter") == "Inter"

    def test_missing_key(self):
        assert _font({}, "heading", "Inter") == "Inter"

    def test_none_value(self):
        assert _font({"heading": None}, "heading", "Inter") == "Inter"


class TestMotionEasing:
    """_motion_easing() derives (duration, ease) from motion block."""

    def test_fast_pace(self):
        dur, ease = _motion_easing({"pace": "fast"})
        assert dur == "0.4s"
        assert "cubic-bezier" in ease

    def test_slow_pace(self):
        dur, ease = _motion_easing({"pace": "slow"})
        assert dur == "0.9s"
        assert "cubic-bezier" in ease

    def test_moderate_pace(self):
        dur, ease = _motion_easing({"pace": "moderate"})
        assert dur == "0.6s"
        assert "cubic-bezier" in ease

    def test_default_when_missing(self):
        dur, ease = _motion_easing({})
        assert dur == "0.6s"
        assert "cubic-bezier" in ease

    def test_default_when_none(self):
        dur, ease = _motion_easing({"pace": None})
        assert dur == "0.6s"
        assert "cubic-bezier" in ease

    def test_case_insensitive(self):
        dur, ease = _motion_easing({"pace": "FAST"})
        assert dur == "0.4s"
        assert "cubic-bezier" in ease


class TestRenderDesignMd:
    """_render_design_md() produces correct markdown."""

    def test_with_playbook_name(self):
        md = _render_design_md(_FALLBACK_CSS_VARS, "playbook `my-playbook`", "my-playbook")
        assert "# DESIGN — my-playbook" in md
        assert "Background:" in md
        assert "Foreground:" in md
        assert "Typography" in md
        assert "Motion" in md

    def test_without_playbook_name(self):
        md = _render_design_md(_FALLBACK_CSS_VARS, "built-in fallback palette", "")
        assert "# DESIGN" in md
        assert "built-in fallback" in md


class TestStyleBridge:
    """style_bridge() main entry point."""

    def test_no_playbook_returns_fallback(self):
        css, md = style_bridge(None)
        assert css == _FALLBACK_CSS_VARS
        assert "built-in fallback" in md

    def test_empty_playbook_returns_fallback(self):
        css, md = style_bridge({})
        assert css["--color-bg"] == "#0B0F1A"
        assert "built-in fallback" in md

    def test_partial_playbook_uses_fallback_for_missing(self):
        css, md = style_bridge({"name": "test-playbook"})
        # No visual_language set → should use fallbacks
        assert css["--color-bg"] == "#0B0F1A"
        assert css["--font-heading"] == "Inter"
        assert "playbook `test-playbook`" in md

    def test_full_playbook_values(self):
        playbook = {
            "name": "cinematic-dark",
            "visual_language": {
                "color_palette": {
                    "background": "#0A0A0A",
                    "text": "#FFFFFF",
                    "accent": "#FF4500",
                    "primary": "#1E90FF",
                    "secondary": "#32CD32",
                    "surface": "#1A1A1A",
                    "muted_text": "#888888",
                },
            },
            "typography": {
                "heading": {"font": "Playfair Display"},
                "body": {"font": "Source Sans Pro"},
                "code": {"family": "Fira Code"},
            },
            "motion": {"pace": "slow"},
        }
        css, md = style_bridge(playbook)
        assert css["--color-bg"] == "#0A0A0A"
        assert css["--color-fg"] == "#FFFFFF"
        assert css["--color-accent"] == "#FF4500"
        assert css["--color-primary"] == "#1E90FF"
        assert css["--color-secondary"] == "#32CD32"
        assert css["--color-surface"] == "#1A1A1A"
        assert css["--color-muted"] == "#888888"
        assert css["--font-heading"] == "Playfair Display"
        assert css["--font-body"] == "Source Sans Pro"
        assert css["--font-mono"] == "Fira Code"
        assert css["--duration-entrance"] == "0.9s"  # slow pace
        assert "cinematic-dark" in md

    def test_edit_decisions_override_colors(self):
        playbook = {
            "name": "test",
            "visual_language": {
                "color_palette": {
                    "background": "#FFF",
                    "text": "#000",
                    "accent": "#F00",
                    "primary": "#00F",
                },
            },
        }
        edit_decisions = {
            "metadata": {
                "primary_color": "#FF00FF",
                "accent_color": "#00FF00",
                "background_color": "#333",
                "text_color": "#CCC",
            },
        }
        css, md = style_bridge(playbook, edit_decisions)
        assert css["--color-primary"] == "#FF00FF"
        assert css["--color-accent"] == "#00FF00"
        assert css["--color-bg"] == "#333"
        assert css["--color-fg"] == "#CCC"

    def test_edit_decisions_partial_override(self):
        playbook = {
            "name": "test",
            "visual_language": {
                "color_palette": {
                    "background": "#FFF",
                    "text": "#000",
                    "accent": "#F00",
                    "primary": "#00F",
                    "secondary": "#0F0",
                    "surface": "#DDD",
                    "muted_text": "#999",
                },
            },
        }
        # Only override primary
        edit_decisions = {"metadata": {"primary_color": "#BADA55"}}
        css, md = style_bridge(playbook, edit_decisions)
        assert css["--color-primary"] == "#BADA55"
        assert css["--color-accent"] == "#F00"  # unchanged
        assert css["--color-bg"] == "#FFF"  # unchanged

    def test_empty_edit_decisions(self):
        css, md = style_bridge({}, None)
        assert css["--color-bg"] == "#0B0F1A"

    def test_edit_decisions_empty_metadata(self):
        css, md = style_bridge({}, {})
        assert css["--color-bg"] == "#0B0F1A"

    def test_palette_with_list_values(self):
        playbook = {
            "name": "list-palette",
            "visual_language": {
                "color_palette": {
                    "background": ["#111", "#222"],
                    "text": ["#EEE"],
                    "accent": ["#FF0"],
                },
            },
        }
        css, md = style_bridge(playbook)
        assert css["--color-bg"] == "#111"
        assert css["--color-fg"] == "#EEE"
        assert css["--color-accent"] == "#FF0"

    def test_visual_language_is_none(self):
        playbook = {"name": "test", "visual_language": None}
        css, md = style_bridge(playbook)
        assert css["--color-bg"] == "#0B0F1A"

    def test_fast_motion_pace(self):
        playbook = {
            "name": "fast-motion",
            "motion": {"pace": "fast"},
        }
        css, md = style_bridge(playbook)
        assert css["--duration-entrance"] == "0.4s"

    def test_design_md_contains_sections(self):
        css, md = style_bridge({
            "name": "my-brand",
            "visual_language": {
                "color_palette": {
                    "background": "#000",
                    "text": "#FFF",
                    "accent": "#FF0",
                },
            },
        })
        assert "Colors" in md
        assert "Typography" in md
        assert "Motion" in md
        assert "var(--color-accent)" in md
        assert "my-brand" in md
    def test_number_value_returns_default(self):
        """Non-dict, non-string value falls back to default."""
        assert _font({"heading": 42}, "heading", "Inter") == "Inter"
