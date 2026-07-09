"""Tests for subtitle_style.py — Phase 5.2 extracted module.

These tests mirror the VideoCompose._resolve_subtitle_style tests but call
the extracted module functions directly. The original VideoCompose methods
become thin delegation wrappers, so existing test_video_compose.py tests
still pass.
"""

import pytest

from multi_publish.video_creation.providers.video.subtitle_style import (
    resolve_subtitle_style,
    DEFAULT_SUBTITLE_STYLE,
)


class TestResolveSubtitleStyle:
    def test_all_empty_returns_defaults(self):
        result = resolve_subtitle_style(None, None, None)
        assert result == DEFAULT_SUBTITLE_STYLE

    def test_defaults_have_expected_keys(self):
        assert DEFAULT_SUBTITLE_STYLE["font"] == "Inter"
        assert DEFAULT_SUBTITLE_STYLE["font_size"] == 28
        assert DEFAULT_SUBTITLE_STYLE["bold"] is True
        assert DEFAULT_SUBTITLE_STYLE["outline_width"] == 2
        assert DEFAULT_SUBTITLE_STYLE["alignment"] == 2
        assert DEFAULT_SUBTITLE_STYLE["margin_v"] == 40

    def test_playbook_provides_font(self):
        playbook = {
            "typography": {"body": {"family": "Roboto"}},
            "visual_language": {"color_palette": {"text": "#333", "background": "#FFF"}},
        }
        result = resolve_subtitle_style(None, None, playbook)
        assert result["font"] == "Roboto"
        assert result["primary_color"] == "#333"
        assert result["outline_color"] == "#FFF"
        assert result["back_color"] == "#FFF"

    def test_edit_decisions_override_defaults(self):
        ed = {"subtitles": {"style": {"font_size": 36, "bold": False}}}
        result = resolve_subtitle_style(None, ed, None)
        assert result["font_size"] == 36
        assert result["bold"] is False

    def test_explicit_override_beats_edit_decisions(self):
        ed = {"subtitles": {"style": {"font_size": 36}}}
        result = resolve_subtitle_style({"font_size": 42}, ed, None)
        assert result["font_size"] == 42

    def test_layering_priority_explicit_wins(self):
        result = resolve_subtitle_style(
            {"font": "Override", "font_size": 50},
            {"subtitles": {"style": {"font": "EditDecisions", "font_size": 40}}},
            {"typography": {"body": {"family": "Playbook"}}},
        )
        assert result["font"] == "Override"
        assert result["font_size"] == 50

    def test_none_values_in_explicit_not_overridden(self):
        result = resolve_subtitle_style(
            {"font": None},
            {"subtitles": {"style": {"font": "Sans"}}},
            None,
        )
        assert result["font"] == "Sans"

    def test_none_values_in_edit_decisions_not_overridden(self):
        result = resolve_subtitle_style(
            None,
            {"subtitles": {"style": {"font": None, "font_size": 40}}},
            {"typography": {"body": {"family": "PlaybookFont"}}},
        )
        assert result["font"] == "PlaybookFont"
        assert result["font_size"] == 40

    def test_playbook_missing_typography_does_not_crash(self):
        result = resolve_subtitle_style(None, None, {"visual_language": {}})
        assert result["font"] == "Inter"  # default

    def test_playbook_missing_color_palette_does_not_crash(self):
        result = resolve_subtitle_style(None, None, {"typography": {}})
        assert result["font"] == "Inter"
