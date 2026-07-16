"""Tests for frame HTML rendering service — migrated from Pixelle-Video (Apache 2.0).

Covers:
- Template loading from all 3 size directories (1080x1080, 1080x1920, 1920x1080)
- Variable substitution ({{ title }}, {{ content }}, {{ image_path }})
- Template selection logic (static_/image_/video_ prefix)
- HTML sanitization (no script injection through variables)
- Frame processor: add/remove/list frames
- Mock Playwright (no real browser launched)
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from multi_publish.services.frame_html import (
    HTMLFrameGenerator,
    parse_template_size,
    get_template_type,
    resolve_template_path,
    TEMPLATES_DIR,
)
from multi_publish.services.frame_processor import Frame, FrameProcessor


# ─── Template path helpers ─────────────────────────────────


class TestTemplatesDir:
    """Verify the templates directory and its 3 size subdirectories exist."""

    def test_templates_dir_exists(self):
        assert TEMPLATES_DIR.exists(), f"Templates dir not found: {TEMPLATES_DIR}"

    def test_templates_dir_resolves_to_python_backend(self):
        # __file__ = src/multi_publish/services/frame_html.py
        # parent^4 = python-backend/
        expected_parent = Path(__file__).resolve().parent.parent / "src" / "multi_publish" / "services"
        # TEMPLATES_DIR should be python-backend/templates
        assert TEMPLATES_DIR.name == "templates"
        assert TEMPLATES_DIR.parent.name == "python-backend"

    def test_three_size_directories_exist(self):
        for size in ("1080x1080", "1080x1920", "1920x1080"):
            d = TEMPLATES_DIR / size
            assert d.exists(), f"Missing size directory: {d}"
            assert d.is_dir()

    def test_default_html_exists_in_each_size(self):
        for size in ("1080x1080", "1080x1920", "1920x1080"):
            f = TEMPLATES_DIR / size / "default.html"
            assert f.exists(), f"Missing default.html in {size}"
            assert f.read_text(encoding="utf-8").startswith("<!DOCTYPE html>")


# ─── parse_template_size ───────────────────────────────────


class TestParseTemplateSize:
    """Parse 'WxH' from template paths."""

    def test_parse_from_full_path(self):
        path = str(TEMPLATES_DIR / "1080x1920" / "default.html")
        w, h = parse_template_size(path)
        assert (w, h) == (1080, 1920)

    def test_parse_square(self):
        w, h = parse_template_size(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        assert (w, h) == (1080, 1080)

    def test_parse_landscape(self):
        w, h = parse_template_size(str(TEMPLATES_DIR / "1920x1080" / "default.html"))
        assert (w, h) == (1920, 1080)

    def test_parse_from_size_string_only(self):
        w, h = parse_template_size("1080x1920")
        assert (w, h) == (1080, 1920)

    def test_parse_no_match_returns_none(self):
        result = parse_template_size("no_size_here.html")
        assert result is None


# ─── get_template_type ─────────────────────────────────────


class TestGetTemplateType:
    """Determine template type from filename prefix."""

    def test_static_prefix(self):
        assert get_template_type("static_cover.html") == "static"

    def test_image_prefix(self):
        assert get_template_type("image_bg.html") == "image"

    def test_video_prefix(self):
        assert get_template_type("video_intro.html") == "video"

    def test_default_no_prefix(self):
        assert get_template_type("default.html") == "image"

    def test_full_path_static(self):
        assert get_template_type(str(TEMPLATES_DIR / "1080x1080" / "static_text.html")) == "static"

    def test_full_path_video(self):
        assert get_template_type(str(TEMPLATES_DIR / "1080x1920" / "video_loop.html")) == "video"


# ─── resolve_template_path ─────────────────────────────────


class TestResolveTemplatePath:
    """Resolve template name to full path."""

    def test_resolve_default(self):
        path = resolve_template_path("1080x1920/default")
        assert path.exists()
        assert "1080x1920" in str(path)

    def test_resolve_with_html_extension(self):
        path = resolve_template_path("1080x1080/default.html")
        assert path.exists()

    def test_resolve_fallback_to_default(self):
        # Non-existent template name should fall back to default.html
        path = resolve_template_path("1080x1920/nonexistent")
        assert path.exists()
        assert path.name == "default.html"

    def test_resolve_invalid_size_raises(self):
        with pytest.raises(FileNotFoundError):
            resolve_template_path("999x999/default")


# ─── HTMLFrameGenerator: template loading ─────────────────


class TestHTMLFrameGeneratorLoading:
    """Test template loading from all 3 size directories."""

    @pytest.mark.parametrize("size,expected_w,expected_h", [
        ("1080x1080", 1080, 1080),
        ("1080x1920", 1080, 1920),
        ("1920x1080", 1920, 1080),
    ])
    def test_load_template_each_size(self, size, expected_w, expected_h):
        template_path = str(TEMPLATES_DIR / size / "default.html")
        gen = HTMLFrameGenerator(template_path)
        assert gen.width == expected_w
        assert gen.height == expected_h
        assert len(gen.template) > 0

    def test_load_template_not_found_raises(self):
        with pytest.raises(FileNotFoundError):
            HTMLFrameGenerator("/nonexistent/template.html")

    def test_template_contains_placeholders(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1920" / "default.html"))
        assert "{{ title }}" in gen.template
        assert "{{ content }}" in gen.template
        assert "{{ image_path }}" in gen.template


# ─── HTMLFrameGenerator: variable substitution ────────────


class TestVariableSubstitution:
    """Test Jinja2-style {{ variable }} substitution."""

    def test_substitute_title(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {"title": "My Title"})
        assert "My Title" in result
        assert "{{ title }}" not in result

    def test_substitute_content(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {"content": "Hello World"})
        assert "Hello World" in result
        assert "{{ content }}" not in result

    def test_substitute_image_path(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {"image_path": "file:///test.png"})
        assert "file:///test.png" in result
        assert "{{ image_path }}" not in result

    def test_substitute_all_three_variables(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "title": "Test Title",
            "content": "Test Content",
            "image_path": "file:///img.png",
        })
        assert "Test Title" in result
        assert "Test Content" in result
        assert "file:///img.png" in result
        assert "{{ title }}" not in result
        assert "{{ content }}" not in result
        assert "{{ image_path }}" not in result

    def test_substitute_missing_variable_becomes_empty(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        # Only provide title, others should become empty string
        result = gen._replace_parameters(gen.template, {"title": "Only Title"})
        assert "Only Title" in result
        assert "{{ title }}" not in result
        assert "{{ content }}" not in result
        assert "{{ image_path }}" not in result

    def test_substitute_with_ext_params(self):
        """Test custom ext parameters are substituted."""
        template_content = '<div>{{ title }} - {{ custom_param }}</div>'
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = template_content  # inject custom template for testing
        result = gen._replace_parameters(template_content, {
            "title": "Hi",
            "custom_param": "CustomValue",
        })
        assert "Hi" in result
        assert "CustomValue" in result

    def test_substitute_dsl_with_default(self):
        """Test DSL syntax {{param:type=default}}."""
        template_content = '<div>{{ accent_color:color=#ff0000 }}</div>'
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = template_content
        # No value provided → use default
        result = gen._replace_parameters(template_content, {})
        assert "#ff0000" in result
        # Value provided → use value
        result2 = gen._replace_parameters(template_content, {"accent_color": "#00ff00"})
        assert "#00ff00" in result2


# ─── HTML sanitization ─────────────────────────────────────


class TestHtmlSanitization:
    """Test that script injection through variables is prevented."""

    def test_script_tag_in_title_is_escaped(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "title": "<script>alert('xss')</script>",
        })
        # The script tag must be escaped, not injected as raw HTML
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_script_tag_in_content_is_escaped(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "content": "<script>alert('xss')</script>",
        })
        assert "<script>alert" not in result
        assert "&lt;script&gt;" in result

    def test_img_onerror_injection_is_escaped(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "image_path": '" onerror="alert(1)',
        })
        # The onerror attribute must not appear unescaped
        assert 'onerror="alert(1)"' not in result

    def test_html_entities_in_content_preserved_as_text(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "content": "<b>bold</b>",
        })
        assert "<b>bold</b>" not in result
        assert "&lt;b&gt;bold&lt;/b&gt;" in result

    def test_file_uri_preserved_in_image_path(self):
        """file:// URIs should be preserved (only HTML-special chars escaped)."""
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "image_path": "file:///C:/path/to/image.png",
        })
        assert "file:///C:/path/to/image.png" in result

    def test_http_url_preserved_in_image_path(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        result = gen._replace_parameters(gen.template, {
            "image_path": "https://example.com/image.png",
        })
        assert "https://example.com/image.png" in result


# ─── HTMLFrameGenerator: parse_template_parameters ─────────


class TestParseTemplateParameters:
    """Test parsing of custom template parameters."""

    def test_parse_no_custom_params(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        params = gen.parse_template_parameters()
        # title, content, image_path are preset params, should not appear
        assert "title" not in params
        assert "content" not in params
        assert "image_path" not in params

    def test_parse_custom_param(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = '<div>{{ accent_color }}</div>'
        params = gen.parse_template_parameters()
        assert "accent_color" in params
        assert params["accent_color"]["type"] == "text"

    def test_parse_param_with_type(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = '<div>{{ bg_color:color }}</div>'
        params = gen.parse_template_parameters()
        assert "bg_color" in params
        assert params["bg_color"]["type"] == "color"

    def test_parse_param_with_default(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = '<div>{{ font_size:number=16 }}</div>'
        params = gen.parse_template_parameters()
        assert "font_size" in params
        assert params["font_size"]["type"] == "number"
        assert params["font_size"]["default"] == 16


# ─── HTMLFrameGenerator: media size ────────────────────────


class TestGetMediaSize:
    """Test media size parsing from template meta tags."""

    def test_get_media_size_from_meta_1080x1080(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        w, h = gen.get_media_size()
        assert w == 1024
        assert h == 1024

    def test_get_media_size_from_meta_1080x1920(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1920" / "default.html"))
        w, h = gen.get_media_size()
        assert w == 1024
        assert h == 1792

    def test_get_media_size_fallback_no_meta(self):
        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))
        gen.template = '<html><body>No meta tags</body></html>'
        w, h = gen.get_media_size()
        assert (w, h) == (1024, 1024)


# ─── HTMLFrameGenerator: generate_frame (mocked Playwright) ─


class TestGenerateFrameMocked:
    """Test generate_frame with mocked Playwright (no real browser)."""

    def _make_mock_browser(self):
        """Create a mock browser/page that simulates Playwright."""
        mock_page = AsyncMock()
        mock_page.set_content = AsyncMock()
        mock_page.screenshot = AsyncMock(return_value=b"fake-png-data")
        mock_page.close = AsyncMock()

        mock_browser = MagicMock()
        mock_browser.new_page = AsyncMock(return_value=mock_page)
        mock_browser.is_connected = MagicMock(return_value=True)
        mock_browser.close = AsyncMock()

        mock_playwright = MagicMock()
        mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)
        mock_playwright.stop = AsyncMock()

        return mock_playwright, mock_browser, mock_page

    def test_generate_frame_returns_output_path(self, tmp_path):
        mock_pw, mock_browser, mock_page = self._make_mock_browser()

        output_path = str(tmp_path / "frame_test.png")
        # Write a dummy file so the path exists after "screenshot"
        async def fake_screenshot(path=None, **kwargs):
            Path(path).write_bytes(b"fake-png")
            return path

        mock_page.screenshot = AsyncMock(side_effect=fake_screenshot)

        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1920" / "default.html"))

        with patch("multi_publish.services.frame_html.async_playwright") as mock_ap_factory:
            mock_ap_factory.return_value.start = AsyncMock(return_value=mock_pw)
            # Reset class-level browser state
            HTMLFrameGenerator._browser = None
            HTMLFrameGenerator._playwright = None
            HTMLFrameGenerator._browser_loop = None

            result = asyncio.run(gen.generate_frame(
                title="Test Title",
                content="Test Content",
                image_path="file:///test.png",
                output_path=output_path,
            ))

        assert result == output_path
        assert Path(output_path).exists()
        mock_page.set_content.assert_called_once()
        mock_page.screenshot.assert_called_once()

    def test_generate_frame_calls_set_content_with_rendered_html(self, tmp_path):
        mock_pw, mock_browser, mock_page = self._make_mock_browser()

        output_path = str(tmp_path / "frame_test.png")
        async def fake_screenshot(path=None, **kwargs):
            Path(path).write_bytes(b"fake-png")
            return path
        mock_page.screenshot = AsyncMock(side_effect=fake_screenshot)

        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))

        with patch("multi_publish.services.frame_html.async_playwright") as mock_ap_factory:
            mock_ap_factory.return_value.start = AsyncMock(return_value=mock_pw)
            HTMLFrameGenerator._browser = None
            HTMLFrameGenerator._playwright = None
            HTMLFrameGenerator._browser_loop = None

            asyncio.run(gen.generate_frame(
                title="My Title",
                content="My Content",
                image_path="file:///img.png",
                output_path=output_path,
            ))

        # Verify set_content was called with HTML containing our values
        call_args = mock_page.set_content.call_args
        html_content = call_args.args[0] if call_args.args else call_args.kwargs.get("html", "")
        assert "My Title" in html_content
        assert "My Content" in html_content
        assert "file:///img.png" in html_content

    def test_generate_frame_auto_output_path(self, tmp_path):
        """When output_path is None, should auto-generate a path."""
        mock_pw, mock_browser, mock_page = self._make_mock_browser()

        async def fake_screenshot(path=None, **kwargs):
            Path(path).write_bytes(b"fake-png")
            return path
        mock_page.screenshot = AsyncMock(side_effect=fake_screenshot)

        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1920x1080" / "default.html"))

        with patch("multi_publish.services.frame_html.async_playwright") as mock_ap_factory:
            mock_ap_factory.return_value.start = AsyncMock(return_value=mock_pw)
            HTMLFrameGenerator._browser = None
            HTMLFrameGenerator._playwright = None
            HTMLFrameGenerator._browser_loop = None

            # Change cwd to tmp_path for auto-generated output
            old_cwd = os.getcwd()
            os.chdir(tmp_path)
            try:
                result = asyncio.run(gen.generate_frame(
                    title="Auto Path",
                    content="Content",
                    image_path="",
                ))
            finally:
                os.chdir(old_cwd)

        assert result is not None
        assert Path(result).exists()

    def test_generate_frame_no_image_path(self, tmp_path):
        """generate_frame should work with empty image_path."""
        mock_pw, mock_browser, mock_page = self._make_mock_browser()

        output_path = str(tmp_path / "frame_no_img.png")
        async def fake_screenshot(path=None, **kwargs):
            Path(path).write_bytes(b"fake-png")
            return path
        mock_page.screenshot = AsyncMock(side_effect=fake_screenshot)

        gen = HTMLFrameGenerator(str(TEMPLATES_DIR / "1080x1080" / "default.html"))

        with patch("multi_publish.services.frame_html.async_playwright") as mock_ap_factory:
            mock_ap_factory.return_value.start = AsyncMock(return_value=mock_pw)
            HTMLFrameGenerator._browser = None
            HTMLFrameGenerator._playwright = None
            HTMLFrameGenerator._browser_loop = None

            result = asyncio.run(gen.generate_frame(
                title="No Image",
                content="Text only",
                image_path="",
                output_path=output_path,
            ))

        assert result == output_path
        call_args = mock_page.set_content.call_args
        html_content = call_args.args[0] if call_args.args else ""
        # Empty image_path → empty src
        assert "No Image" in html_content


# ─── FrameProcessor: frame management ─────────────────────


class TestFrameProcessorManagement:
    """Test frame add/remove/list operations."""

    def test_add_frame(self):
        fp = FrameProcessor()
        frame = Frame(index=0, title="Frame 1", content="Content 1")
        fp.add_frame(frame)
        assert len(fp.list_frames()) == 1

    def test_add_multiple_frames(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        fp.add_frame(Frame(index=1, title="F2", content="C2"))
        fp.add_frame(Frame(index=2, title="F3", content="C3"))
        assert len(fp.list_frames()) == 3

    def test_remove_frame_by_index(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        fp.add_frame(Frame(index=1, title="F2", content="C2"))
        fp.remove_frame(0)
        frames = fp.list_frames()
        assert len(frames) == 1
        assert frames[0].title == "F2"

    def test_remove_nonexistent_frame_no_error(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        # Removing non-existent index should not raise
        fp.remove_frame(99)
        assert len(fp.list_frames()) == 1

    def test_list_frames_empty(self):
        fp = FrameProcessor()
        assert fp.list_frames() == []

    def test_list_frames_preserves_order(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="First", content="A"))
        fp.add_frame(Frame(index=1, title="Second", content="B"))
        fp.add_frame(Frame(index=2, title="Third", content="C"))
        titles = [f.title for f in fp.list_frames()]
        assert titles == ["First", "Second", "Third"]

    def test_get_frame_by_index(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        fp.add_frame(Frame(index=1, title="F2", content="C2"))
        frame = fp.get_frame(1)
        assert frame is not None
        assert frame.title == "F2"

    def test_get_nonexistent_frame_returns_none(self):
        fp = FrameProcessor()
        assert fp.get_frame(0) is None

    def test_clear_frames(self):
        fp = FrameProcessor()
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        fp.add_frame(Frame(index=1, title="F2", content="C2"))
        fp.clear()
        assert fp.list_frames() == []

    def test_frame_count(self):
        fp = FrameProcessor()
        assert fp.frame_count() == 0
        fp.add_frame(Frame(index=0, title="F1", content="C1"))
        assert fp.frame_count() == 1
        fp.add_frame(Frame(index=1, title="F2", content="C2"))
        assert fp.frame_count() == 2


# ─── FrameProcessor: template selection ────────────────────


class TestFrameProcessorTemplateSelection:
    """Test template selection logic based on size + content type."""

    def test_select_default_template(self):
        fp = FrameProcessor()
        path = fp.select_template("1080x1920", "image")
        assert path.exists()
        assert "1080x1920" in str(path)

    def test_select_template_all_sizes(self):
        fp = FrameProcessor()
        for size in ("1080x1080", "1080x1920", "1920x1080"):
            path = fp.select_template(size, "image")
            assert path.exists(), f"Template not found for size {size}"

    def test_select_static_template_falls_back_to_default(self):
        """If no static_*.html exists, fall back to default.html."""
        fp = FrameProcessor()
        path = fp.select_template("1080x1080", "static")
        assert path.exists()
        assert path.name == "default.html"

    def test_select_video_template_falls_back_to_default(self):
        fp = FrameProcessor()
        path = fp.select_template("1080x1920", "video")
        assert path.exists()
        assert path.name == "default.html"

    def test_select_template_invalid_size_raises(self):
        fp = FrameProcessor()
        with pytest.raises(FileNotFoundError):
            fp.select_template("999x999", "image")

    def test_select_template_unknown_type_defaults_to_image(self):
        fp = FrameProcessor()
        path = fp.select_template("1080x1080", "unknown_type")
        assert path.exists()
        assert path.name == "default.html"


# ─── Frame dataclass ───────────────────────────────────────


class TestFrameDataclass:
    """Test the Frame dataclass."""

    def test_frame_defaults(self):
        f = Frame(index=0)
        assert f.title == ""
        assert f.content == ""
        assert f.image_path is None
        assert f.video_path is None
        assert f.composed_image_path is None
        assert f.media_type is None

    def test_frame_with_values(self):
        f = Frame(
            index=5,
            title="My Title",
            content="My Content",
            image_path="/path/to/img.png",
            media_type="image",
        )
        assert f.index == 5
        assert f.title == "My Title"
        assert f.content == "My Content"
        assert f.image_path == "/path/to/img.png"
        assert f.media_type == "image"

    def test_frame_is_video(self):
        f = Frame(index=0, media_type="video", video_path="/path/to/video.mp4")
        assert f.is_video is True

    def test_frame_is_not_video(self):
        f = Frame(index=0, media_type="image")
        assert f.is_video is False

    def test_frame_has_media(self):
        f = Frame(index=0, image_path="/img.png")
        assert f.has_media is True

    def test_frame_no_media(self):
        f = Frame(index=0)
        assert f.has_media is False


# ─── close_browser ─────────────────────────────────────────


class TestCloseBrowser:
    """Test browser lifecycle management."""

    def test_close_browser_when_none(self):
        # Should not raise when browser is None
        HTMLFrameGenerator._browser = None
        HTMLFrameGenerator._playwright = None
        asyncio.run(HTMLFrameGenerator.close_browser())

    def test_close_browser_with_mock(self):
        mock_browser = AsyncMock()
        mock_pw = AsyncMock()
        HTMLFrameGenerator._browser = mock_browser
        HTMLFrameGenerator._playwright = mock_pw
        HTMLFrameGenerator._browser_loop = None

        asyncio.run(HTMLFrameGenerator.close_browser())

        mock_browser.close.assert_called_once()
        mock_pw.stop.assert_called_once()
        assert HTMLFrameGenerator._browser is None
        assert HTMLFrameGenerator._playwright is None
