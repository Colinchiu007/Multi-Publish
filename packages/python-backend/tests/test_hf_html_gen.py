"""Tests for hyperframes HTML generation — extracted from hyperframes_compose.py.

Covers the pure HTML emission for HyperFrames composition contracts:
- ``cut_to_html``: 5 scene shapes (text_card / image / video / composition / placeholder)
- ``generate_index_html``: full-doc invariants + audio element emission

These functions were extracted from ``HyperFramesCompose._cut_to_html`` and
``_generate_index_html`` (both pure, zero I/O). Before extraction they had
**zero** direct test coverage — this file establishes the regression net.

The functions accept a ``host`` object providing ``_f`` / ``_escape_text`` /
``_escape_attr`` / ``_rel_from_workspace`` so the HyperFramesCompose class
can delegate cleanly while keeping the same helper-injection seam for tests.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from multi_publish.video_creation.providers.video.hf_html_gen import (
    cut_to_html,
    generate_index_html,
)
from multi_publish.video_creation.providers.video.hf_utils import (
    escape_text,
    rel_from_workspace,
)


# ─── Helpers ────────────────────────────────────────────────


def _make_host() -> SimpleNamespace:
    """Construct a minimal host object exposing the 4 helper methods.

    The compose class delegates these to ``hf_utils``; we replicate the
    compose class's ``_f`` behavior (zero-decimal rule) rather than the
    slightly different ``hf_utils._f``.
    """

    @staticmethod
    def _f(v: float) -> str:
        return f"{v:.0f}" if v == int(v) else f"{v}"

    @staticmethod
    def _escape_attr(s: str) -> str:
        return escape_text(s).replace('"', "&quot;")

    return SimpleNamespace(
        _f=_f,
        _escape_text=staticmethod(escape_text),
        _escape_attr=_escape_attr,
        _rel_from_workspace=staticmethod(rel_from_workspace),
    )


# ─── cut_to_html: text_card shape ───────────────────────────


class TestCutToHtmlTextCard:
    def test_text_card_with_text(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 0, "out_seconds": 5, "text": "Hello"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'id="cut-0"' in html
        assert 'class="clip text-card"' in html
        assert "<h1>Hello</h1>" in html
        assert 'data-start="0"' in html
        assert 'data-duration="5"' in html
        assert 'data-track-index="1"' in html
        # text_card produces an entrance tween
        assert tween is not None
        assert 'tl.from("#cut-0 h1"' in tween
        assert "power3.out" in tween

    def test_text_card_with_subtitle(self):
        host = _make_host()
        cut = {
            "type": "text_card",
            "in_seconds": 0,
            "out_seconds": 3,
            "text": "Title",
            "subtitle": "Sub",
        }
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert '<div class="subtitle">Sub</div>' in html

    def test_text_card_with_caption_as_subtitle_fallback(self):
        """``caption`` is the fallback key for ``subtitle``."""
        host = _make_host()
        cut = {
            "type": "text_card",
            "in_seconds": 0,
            "out_seconds": 3,
            "text": "Title",
            "caption": "Cap",
        }
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert '<div class="subtitle">Cap</div>' in html

    def test_text_card_without_text_defaults_to_scene_n(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 0, "out_seconds": 3}
        html, _ = cut_to_html(host, 2, cut, 1920, 1080)
        # index=2 → "Scene 3"
        assert "<h1>Scene 3</h1>" in html

    def test_text_card_via_type_alias_hero_title(self):
        """``hero_title`` is also routed to text_card shape."""
        host = _make_host()
        cut = {"type": "hero_title", "in_seconds": 0, "out_seconds": 3, "text": "Hero"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip text-card"' in html
        assert "<h1>Hero</h1>" in html
        assert tween is not None

    def test_text_card_via_type_alias_callout(self):
        """``callout`` is also routed to text_card shape."""
        host = _make_host()
        cut = {"type": "callout", "in_seconds": 0, "out_seconds": 3, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip text-card"' in html

    def test_text_card_auto_detected_when_source_missing_but_text_present(self):
        """No ``type`` but ``text`` present and no ``source`` → text_card shape."""
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 3, "text": "Auto"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip text-card"' in html
        assert "<h1>Auto</h1>" in html

    def test_text_card_escapes_html_in_text(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 0, "out_seconds": 3, "text": "<script>x</script>"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert "<script>x</script>" not in html
        assert "&lt;script&gt;x&lt;/script&gt;" in html

    def test_text_card_tween_uses_in_seconds_plus_0_1_offset(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 5, "out_seconds": 10, "text": "X"}
        _, tween = cut_to_html(host, 0, cut, 1920, 1080)
        # offset is in_seconds + 0.1 → "5.1"
        assert ", 5.1);" in tween


# ─── cut_to_html: image shape ───────────────────────────────


class TestCutToHtmlImage:
    def test_jpg_image_emits_img_clip(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "assets/scene.jpg"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip image-clip"' in html
        assert html.startswith('<img id="cut-0"')
        assert 'src="' in html
        assert 'data-track-index="1"' in html
        assert "muted" not in html  # images are not muted video
        assert tween is not None
        assert 'tl.from("#cut-0", { scale: 1.05' in tween
        assert "power2.out" in tween

    def test_png_image_supported(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "a.png"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip image-clip"' in html

    def test_webp_image_supported(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "a.webp"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip image-clip"' in html

    def test_image_attr_escapes_quotes_in_src(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": 'a"b.jpg'}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        # The quote in the filename must be escaped in the attribute value
        assert '&quot;' in html


# ─── cut_to_html: video shape ───────────────────────────────


class TestCutToHtmlVideo:
    def test_mp4_video_emits_video_clip_muted_playsinline(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "assets/clip.mp4"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip video-clip"' in html
        assert html.startswith("<video ")
        assert "muted" in html
        assert "playsinline" in html
        # video clips do NOT emit an entrance tween
        assert tween is None

    def test_mov_video_supported(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "a.mov"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip video-clip"' in html

    def test_webm_video_supported(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "a.webm"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip video-clip"' in html


# ─── cut_to_html: composition-clip shape ────────────────────


class TestCutToHtmlComposition:
    def test_html_source_emits_composition_clip(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "compositions/intro.html"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip composition-clip"' in html
        assert 'data-composition-id="intro"' in html  # stem of intro.html
        assert 'data-composition-src="compositions/intro.html"' in html
        assert 'data-width="1920"' in html
        assert 'data-height="1080"' in html
        # composition clips do NOT emit an entrance tween
        assert tween is None

    def test_htm_extension_also_treated_as_composition(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "source": "a.htm"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'class="clip composition-clip"' in html


# ─── cut_to_html: placeholder fallback ──────────────────────


class TestCutToHtmlPlaceholder:
    def test_unknown_type_no_source_no_text_falls_back_to_placeholder(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "type": "unknown_shape"}
        html, tween = cut_to_html(host, 0, cut, 1920, 1080)
        # Falls back to text_card with "Scene N" default
        assert 'class="clip text-card"' in html
        assert "<h1>Scene 1</h1>" in html
        assert tween is None  # placeholder has no entrance tween

    def test_placeholder_uses_reason_when_no_text(self):
        host = _make_host()
        cut = {"in_seconds": 0, "out_seconds": 5, "type": "unknown_shape", "reason": "missing asset"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert "<h1>missing asset</h1>" in html

    def test_placeholder_prefers_text_over_reason(self):
        host = _make_host()
        cut = {
            "in_seconds": 0,
            "out_seconds": 5,
            "type": "unknown_shape",
            "text": "Real text",
            "reason": "Fallback reason",
        }
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert "<h1>Real text</h1>" in html
        assert "Fallback reason" not in html


# ─── cut_to_html: duration edge cases ───────────────────────


class TestCutToHtmlDuration:
    def test_zero_duration_clamped_to_0_1(self):
        """``max(0.1, out_s - in_s)`` floor."""
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 0, "out_seconds": 0, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'data-duration="0.1"' in html

    def test_negative_duration_clamped_to_0_1(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 5, "out_seconds": 2, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'data-duration="0.1"' in html

    def test_missing_in_seconds_defaults_to_0(self):
        host = _make_host()
        cut = {"type": "text_card", "out_seconds": 3, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'data-start="0"' in html

    def test_missing_out_seconds_defaults_to_0_then_clamped(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 2, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        # out_s defaults to 0 → duration = max(0.1, 0-2) = 0.1
        assert 'data-duration="0.1"' in html

    def test_fractional_duration_preserved(self):
        host = _make_host()
        cut = {"type": "text_card", "in_seconds": 0, "out_seconds": 2.5, "text": "X"}
        html, _ = cut_to_html(host, 0, cut, 1920, 1080)
        assert 'data-duration="2.5"' in html


# ─── generate_index_html: full-doc invariants ───────────────


class TestGenerateIndexHtml:
    def test_basic_structure_present(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={"--color-bg": "#000"},
            title="My Video",
        )
        assert html.startswith("<!DOCTYPE html>")
        assert '<html lang="en">' in html
        assert "<title>My Video</title>" in html
        assert "<style>" in html
        assert "gsap.min.js" in html  # CDN script
        assert 'data-composition-id="root"' in html

    def test_css_vars_injected_into_root(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={"--color-bg": "#fff", "--font-body": "sans-serif"},
            title="X",
        )
        assert "--color-bg: #fff;" in html
        assert "--font-body: sans-serif;" in html

    def test_root_div_has_dimensions_and_duration(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1280,
            height=720,
            total_duration=30,
            css_vars={},
            title="X",
        )
        assert 'data-start="0"' in html
        assert 'data-duration="30"' in html
        assert 'data-width="1280"' in html
        assert 'data-height="720"' in html

    def test_title_is_html_escaped(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="<b>Bold</b> & <i>italic</i>",
        )
        assert "<title><b>Bold</b>" not in html
        assert "<title>&lt;b&gt;Bold&lt;/b&gt; &amp; &lt;i&gt;italic&lt;/i&gt;</title>" in html

    def test_cuts_rendered_in_order(self):
        host = _make_host()
        cuts = [
            {"type": "text_card", "in_seconds": 0, "out_seconds": 2, "text": "A"},
            {"type": "text_card", "in_seconds": 2, "out_seconds": 4, "text": "B"},
        ]
        html = generate_index_html(
            host,
            cuts=cuts,
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=4,
            css_vars={},
            title="X",
        )
        assert 'id="cut-0"' in html
        assert 'id="cut-1"' in html
        # Both should appear in order
        assert html.index('id="cut-0"') < html.index('id="cut-1"')

    def test_empty_cuts_produces_no_tweens_marker(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert "// no tweens" in html

    def test_tweens_aggregated_into_block(self):
        host = _make_host()
        cuts = [
            {"type": "text_card", "in_seconds": 0, "out_seconds": 2, "text": "A"},
            {"type": "text_card", "in_seconds": 2, "out_seconds": 4, "text": "B"},
        ]
        html = generate_index_html(
            host,
            cuts=cuts,
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=4,
            css_vars={},
            title="X",
        )
        # Both tweens should be present
        assert 'tl.from("#cut-0 h1"' in html
        assert 'tl.from("#cut-1 h1"' in html
        assert "// no tweens" not in html


# ─── generate_index_html: narration audio ───────────────────


class TestGenerateIndexHtmlNarration:
    def test_narration_emits_audio_with_track_index_2(self):
        host = _make_host()
        audio_refs = {
            "narration": [
                {"src": "audio/nar1.mp3", "start_seconds": 0, "end_seconds": 5},
            ]
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert '<audio id="nar-0"' in html
        assert 'data-start="0"' in html
        assert 'data-duration="5"' in html
        assert 'data-track-index="2"' in html
        assert 'data-volume="1"' in html

    def test_narration_end_seconds_none_uses_total_minus_start(self):
        host = _make_host()
        audio_refs = {
            "narration": [
                {"src": "audio/nar.mp3", "start_seconds": 3},  # no end_seconds
            ]
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        # duration = total_duration - start = 10 - 3 = 7
        assert 'data-start="3"' in html
        assert 'data-duration="7"' in html

    def test_narration_end_seconds_before_start_uses_total_minus_start(self):
        host = _make_host()
        audio_refs = {
            "narration": [
                {"src": "audio/nar.mp3", "start_seconds": 4, "end_seconds": 2},
            ]
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        # end (2) is not > start (4) → duration = total - start = 6
        assert 'data-start="4"' in html
        assert 'data-duration="6"' in html

    def test_narration_start_seconds_defaults_to_0(self):
        host = _make_host()
        audio_refs = {
            "narration": [
                {"src": "audio/nar.mp3", "end_seconds": 5},  # no start_seconds
            ]
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert 'data-start="0"' in html

    def test_multiple_narration_segments_indexed_sequentially(self):
        host = _make_host()
        audio_refs = {
            "narration": [
                {"src": "a.mp3", "start_seconds": 0, "end_seconds": 3},
                {"src": "b.mp3", "start_seconds": 3, "end_seconds": 6},
            ]
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert '<audio id="nar-0"' in html
        assert '<audio id="nar-1"' in html

    def test_no_narration_emits_no_nar_audio(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert "nar-" not in html

    def test_empty_narration_list_emits_no_nar_audio(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={"narration": []},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert "nar-" not in html


# ─── generate_index_html: music audio ───────────────────────


class TestGenerateIndexHtmlMusic:
    def test_music_emits_audio_with_track_index_3(self):
        host = _make_host()
        audio_refs = {
            "music": {"src": "audio/music.mp3", "volume": 0.4},
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=30,
            css_vars={},
            title="X",
        )
        assert '<audio id="music"' in html
        assert 'data-start="0"' in html
        assert 'data-duration="30"' in html
        assert 'data-track-index="3"' in html
        assert 'data-volume="0.4"' in html

    def test_music_absent_emits_no_music_audio(self):
        host = _make_host()
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs={},
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert '<audio id="music"' not in html

    def test_music_volume_zero_emitted_as_zero(self):
        """Volume 0 should be emitted as ``data-volume="0"`` not None."""
        host = _make_host()
        audio_refs = {
            "music": {"src": "audio/music.mp3", "volume": 0},
        }
        html = generate_index_html(
            host,
            cuts=[],
            audio_refs=audio_refs,
            width=1920,
            height=1080,
            total_duration=10,
            css_vars={},
            title="X",
        )
        assert 'data-volume="0"' in html
