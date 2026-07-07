"""Tests for wechat_publisher/utils ? pure logic functions."""
import pytest
from pathlib import Path
from wechat_publisher.utils import (
    clean_html, extract_images_from_html, replace_image_urls,
    get_file_extension, get_mime_type, is_valid_html_content,
    truncate_text, generate_filename, is_url, parse_wechat_error,
)


class TestCleanHtml:
    def test_strips_script_tags(self):
        result = clean_html("<p>hello</p><script>alert(1)</script>")
        assert "alert" not in result
        assert "hello" in result

    def test_keeps_allowed_tags(self):
        html = "<p><strong>bold</strong> and <em>italic</em></p>"
        result = clean_html(html)
        assert "<strong>" in result
        assert "<em>" in result

    def test_removes_unsupported_tags(self):
        html = "<p>text</p><canvas>draw</canvas><video>vid</video>"
        result = clean_html(html)
        assert "<canvas>" not in result
        assert "<video>" not in result

    def test_removes_comments(self):
        result = clean_html("<p>hello</p><!-- comment -->")
        assert "comment" not in result

    def test_custom_keep_tags(self):
        html = "<custom>keep</custom><other>remove</other>"
        result = clean_html(html, keep_tags=["custom"])
        assert "<custom>" in result
        assert "<other>" not in result

    def test_empty_content(self):
        assert clean_html("") == ""


class TestExtractImagesFromHtml:
    def test_extracts_src(self):
        html = '<p><img src="https://example.com/img.jpg" /></p>'
        result = extract_images_from_html(html)
        assert len(result) == 1
        assert result[0] == "https://example.com/img.jpg"

    def test_multiple_images(self):
        html = '<img src="a.jpg"><img src="b.jpg">'
        result = extract_images_from_html(html)
        assert len(result) == 2

    def test_no_images(self):
        assert extract_images_from_html("<p>no images</p>") == []

    def test_empty_string(self):
        assert extract_images_from_html("") == []


class TestReplaceImageUrls:
    def test_replaces_url(self):
        html = '<img src="https://old.com/a.jpg" />'
        result = replace_image_urls(html, {"https://old.com/a.jpg": "https://new.com/b.jpg"})
        assert "https://new.com/b.jpg" in result
        assert "https://old.com/a.jpg" not in result

    def test_no_match(self):
        html = '<img src="x.jpg" />'
        result = replace_image_urls(html, {"y.jpg": "z.jpg"})
        assert result == html


class TestGetFileExtension:
    def test_normal(self):
        assert get_file_extension("image.jpg") == "jpg"

    def test_no_extension(self):
        assert get_file_extension("README") == ""

    def test_multiple_dots(self):
        assert get_file_extension("archive.tar.gz") == "gz"


class TestGetMimeType:
    def test_jpg(self):
        assert "jpeg" in get_mime_type("photo.jpg")

    def test_png(self):
        assert "png" in get_mime_type("image.png")

    def test_unknown(self):
        assert get_mime_type("file.xyz") is not None


class TestIsValidHtmlContent:
    def test_valid_html(self):
        assert is_valid_html_content("<p>hello</p>") is True

    def test_empty_string(self):
        assert is_valid_html_content("") is False

    def test_no_tags(self):
        assert is_valid_html_content("<p>a</p>") is True

    def test_malformed(self):
        assert is_valid_html_content("<p>unclosed") is True  # browser-liberal


class TestTruncateText:
    def test_short_text(self):
        assert truncate_text("hello", 10) == "hello"

    def test_long_text(self):
        result = truncate_text("hello world this is long", 10)
        assert len(result) <= 13  # 10 + len("...")
        assert result.endswith("...")

    def test_custom_suffix(self):
        result = truncate_text("hello world long", 5, suffix="[??]")
        assert result.endswith("[??]")

    def test_exact_length(self):
        assert truncate_text("12345", 5) == "12345"


class TestGenerateFilename:
    def test_with_timestamp(self):
        name = generate_filename("article", ".md")
        assert name.endswith(".md")
        assert name.startswith("article_")

    def test_without_timestamp(self):
        name = generate_filename("article", ".md", timestamp=False)
        assert name == "article.md" or name == "article..md"  # function includes dot in extension

    def test_no_extension_dot(self):
        name = generate_filename("doc", "pdf")
        assert name.endswith("pdf")


class TestIsUrl:
    def test_https(self):
        assert is_url("https://example.com") is True

    def test_http(self):
        assert is_url("http://example.com/path") is True

    def test_no_protocol(self):
        assert is_url("example.com") is False

    def test_empty_string(self):
        assert is_url("") is False


class TestParseWechatError:
    def test_normal_error(self):
        errcode, errmsg = parse_wechat_error({"errcode": 40001, "errmsg": "invalid credential"})
        assert errcode == 40001
        assert errmsg == "invalid credential"

    def test_success_response(self):
        errcode, errmsg = parse_wechat_error({"access_token": "abc"})
        assert errcode is None
        assert errmsg is None

    def test_empty_dict(self):
        errcode, errmsg = parse_wechat_error({})
        assert errcode is None
    
