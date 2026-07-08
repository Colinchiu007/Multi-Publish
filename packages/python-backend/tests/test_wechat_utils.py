"""Tests for wechat_publisher/utils.py -- pure utility functions."""

from __future__ import annotations

import builtins
import hashlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from wechat_publisher.utils import (
    build_api_url,
    calculate_file_hash,
    clean_html,
    download_image,
    extract_images_from_html,
    generate_filename,
    get_file_extension,
    get_mime_type,
    is_url,
    is_valid_html_content,
    is_valid_image_file,
    parse_wechat_error,
    replace_image_urls,
    resize_image_if_needed,
    truncate_text,
)


def _patch_pil_import(mock_img):
    orig_import = builtins.__import__
    def mock_import(name, *args, **kwargs):
        if name == "PIL.Image":
            return mock_img
        if name == "PIL":
            m = MagicMock()
            m.Image = mock_img
            return m
        return orig_import(name, *args, **kwargs)
    return patch("builtins.__import__", side_effect=mock_import)


def _patch_dt_import(mock_dt_cls):
    orig_import = builtins.__import__
    def mock_import(name, *args, **kwargs):
        if name == "datetime":
            m = MagicMock()
            m.datetime = mock_dt_cls
            return m
        return orig_import(name, *args, **kwargs)
    return patch("builtins.__import__", side_effect=mock_import)


class TestCleanHtml:
    def test_rm_script(self):
        r = clean_html("<p>h</p><script>alert(1)</script>")
        assert "alert" not in r
    def test_rm_style(self):
        r = clean_html("<p>t</p><style>body{}</style>")
        assert "body" not in r
    def test_rm_comment(self):
        r = clean_html("<p>t</p><!-- c -->")
        assert "c" not in r
    def test_keep_allowed(self):
        r = clean_html("<p>t</p><strong>b</strong>")
        assert "<p>" in r
    def test_rm_disallowed(self):
        r = clean_html("<p>t</p><marquee>s</marquee>")
        assert "marquee" not in r
    def test_custom_keep(self):
        r = clean_html("<p>t</p><table><tr><td>c</td></tr></table>", keep_tags=["p"])
        assert "<table>" not in r
    def test_img_normalize(self):
        r = clean_html('<img src="https://ex.com/i.png" w="100">')
        assert "/>" in r
    def test_rm_empty_p(self):
        r = clean_html("<p>t</p><p>  </p><p>m</p>")
        assert "m" in r
    def test_norm_ws(self):
        r = clean_html("<p>  a   b  </p>")
        assert "a b" in r


class TestExtractImgs:
    def test_basic(self):
        assert extract_images_from_html('<img src="a.jpg" />') == ["a.jpg"]
    def test_single_q(self):
        assert extract_images_from_html("<img src='a.jpg' />") == ["a.jpg"]
    def test_multi(self):
        assert len(extract_images_from_html('<img src="a.jpg" /><img src="b.jpg" />')) == 2
    def test_skip_data(self):
        imgs = extract_images_from_html('<img src="data:p;b,a" /><img src="r.jpg" />')
        assert "r.jpg" in imgs
    def test_none(self):
        assert extract_images_from_html("<p>n</p>") == []
    def test_dedup(self):
        assert len(extract_images_from_html('<img src="s.jpg" /><img src="s.jpg" />')) == 1


class TestReplaceUrls:
    def test_basic(self):
        assert "new.jpg" in replace_image_urls('<img src="old.jpg" />', {"old.jpg": "new.jpg"})
    def test_empty(self):
        h = '<img src="t.jpg" />'
        assert replace_image_urls(h, {}) == h


class TestFileExt:
    def test_norm(self):
        assert get_file_extension("photo.jpg") == "jpg"
    def test_multi_dot(self):
        assert get_file_extension("a.tar.gz") == "gz"
    def test_none(self):
        assert get_file_extension("README") == ""
    def test_hidden(self):
        assert get_file_extension(".gitignore") == ""
    def test_upper(self):
        assert get_file_extension("Photo.JPG") == "jpg"


class TestMime:
    def test_jpg(self):
        assert get_mime_type("x.jpg") == "image/jpeg"
    def test_png(self):
        assert get_mime_type("x.png") == "image/png"
    def test_pdf(self):
        assert get_mime_type("x.pdf") == "application/pdf"
    def test_unknown(self):
        assert get_mime_type("x.xyz") == "application/octet-stream"


class TestValidImg:
    def test_not_exists(self, tmp_path):
        assert is_valid_image_file(tmp_path / "n.jpg") is False
    def test_too_large(self, tmp_path):
        f = tmp_path / "l.jpg"
        f.write_bytes(b"x" * (11*1024*1024))
        assert is_valid_image_file(f) is False
    def test_ok(self, tmp_path):
        f = tmp_path / "p.jpg"
        f.write_bytes(b"x")
        assert is_valid_image_file(f) is True
    def test_bad_ext(self, tmp_path):
        f = tmp_path / "d.pdf"
        f.write_bytes(b"x")
        assert is_valid_image_file(f) is False


class TestHtmlContent:
    def test_empty(self):
        assert is_valid_html_content("") is False
    def test_ok(self):
        assert is_valid_html_content("<p>h</p>") is True
    def test_plain(self):
        assert is_valid_html_content("txt") is True


class TestTrunc:
    def test_no(self):
        assert truncate_text("hi", 10) == "hi"
    def test_yes(self):
        assert truncate_text("hello world", 8).endswith("...")
    def test_custom(self):
        assert truncate_text("hello world", 8, "..").endswith("..")


class TestGenFn:
    def test_with_ts(self):
        m = MagicMock()
        m.now.return_value.strftime.return_value = "20260101_120000"
        with _patch_dt_import(m):
            r = generate_filename("test", "jpg", True)
        assert "20260101_120000" in r
    def test_no_ts(self):
        assert generate_filename("test", "jpg", False) == "test.jpg"


class TestParseErr:
    def test_no_err(self):
        c, m = parse_wechat_error({"errcode": 0, "errmsg": "ok"})
        assert c is None
    def test_has_err(self):
        c, m = parse_wechat_error({"errcode": 40001, "errmsg": "bad"})
        assert c == 40001
    def test_no_code(self):
        c, m = parse_wechat_error({"status": "ok"})
        assert c is None
    def test_empty(self):
        c, m = parse_wechat_error({})
        assert c is None


class TestBuildUrl:
    def test_simple(self):
        u = build_api_url("https://api.example.com/token", {"k": "v"})
        assert "k=v" in u
    def test_none_rm(self):
        u = build_api_url("https://api.example.com", {"k": "v", "opt": None})
        assert "opt" not in u


class TestIsUrl:
    def test_http(self):
        assert is_url("http://ex.com") is True
    def test_https(self):
        assert is_url("https://ex.com") is True
    def test_not(self):
        assert is_url("not") is False
    def test_ftp(self):
        assert is_url("ftp://ex.com") is False


class TestDl:
    def test_not_impl(self):
        with pytest.raises(NotImplementedError):
            download_image("http://ex.com/i.jpg", Path("/tmp/i.jpg"))


class TestHash:
    def test_known(self, tmp_path):
        f = tmp_path / "t.txt"
        f.write_text("hello")
        assert calculate_file_hash(f) == hashlib.sha256(b"hello").hexdigest()
    def test_empty(self, tmp_path):
        f = tmp_path / "e.txt"
        f.write_text("")
        assert calculate_file_hash(f) == hashlib.sha256(b"").hexdigest()


class TestResize:
    def test_no_pil(self, tmp_path):
        f = tmp_path / "t.jpg"
        f.write_text("x")
        with patch("builtins.__import__", side_effect=ImportError("no PIL")):
            assert resize_image_if_needed(f) == f
    def test_no_resize(self, tmp_path):
        f = tmp_path / "t.jpg"
        f.write_text("x")
        m = MagicMock()
        m.open.return_value = m
        m.width = 100
        m.height = 100
        with _patch_pil_import(m):
            assert resize_image_if_needed(f, 1920, 1080) == f
    def test_resize(self, tmp_path):
        f = tmp_path / "t.jpg"
        f.write_text("x")
        m = MagicMock()
        m.open.return_value = m
        m.width = 3000
        m.height = 2000
        with _patch_pil_import(m):
            r = resize_image_if_needed(f, 1920, 1080)
        m.thumbnail.assert_called_once()
        assert "_resized" in str(r)
