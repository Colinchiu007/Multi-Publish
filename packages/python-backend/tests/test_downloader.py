"""Tests for DownloadManager ? merged (new + legacy)"""

import os
import tempfile
from unittest.mock import patch

import pytest

from multi_publish.core.downloader import DownloadManager, DownloadResult


def test_download_result():
    r = DownloadResult(source_url="https://example.com/v.mp4", state=1, file_size=1024, file_type="mp4")
    assert r.state == 1


def test_download_result_error():
    r = DownloadResult(source_url="https://example.com/f.mp4", state=-1, msg="404")
    assert r.state == -1


@pytest.mark.asyncio
async def test_download_empty_url():
    dm = DownloadManager()
    result = await dm.download("")
    assert result is not None


def test_download_manager_defaults():
    dm = DownloadManager()
    assert dm.max_concurrent >= 1
    assert dm.max_retries >= 1


def test_download_result_defaults():
    r = DownloadResult(source_url="https://example.com/video.mp4")
    assert r.source_url == "https://example.com/video.mp4"
    assert r.local_path == ""
    assert r.state == 0


def test_download_result_full():
    r = DownloadResult(
        source_url="https://example.com/v.mp4",
        local_path="/tmp/v.mp4",
        state=1,
        msg="OK",
        file_size=1024,
        file_type="mp4",
        duration=1.5,
    )
    assert r.state == 1
    assert r.file_size == 1024


@pytest.fixture
def dl_manager():
    return DownloadManager(
        download_dir=tempfile.mkdtemp(),
        max_concurrent=3,
    )


def test_dl_manager_init(dl_manager):
    assert dl_manager.max_concurrent == 3
    assert dl_manager.max_retries == 3
    assert len(dl_manager._cache) == 0


def test_is_downloading_new_url(dl_manager):
    assert dl_manager.is_downloading("https://example.com/v.mp4") is False


def test_clear_cache(dl_manager):
    dl_manager._cache["test-key"] = "/tmp/test-file"
    dl_manager.clear_cache()
    assert len(dl_manager._cache) == 0


def test_get_cache_size(dl_manager):
    size = dl_manager.get_cache_size()
    assert size >= 0


def test_format_size(dl_manager):
    result = dl_manager.format_size(100)
    assert "B" in result or "100" in result


def test_concurrent_limit(dl_manager):
    assert dl_manager._semaphore._value == 3


# ========== _guess_ext ==========

class TestGuessExt:
    def test_url_with_ext(self):
        dm = DownloadManager()
        assert dm._guess_ext("https://example.com/video.mp4", "mp4") == ".mp4"

    def test_url_with_query_params(self):
        dm = DownloadManager()
        assert dm._guess_ext("https://example.com/video.mp4?token=abc&exp=123", "mp4") == ".mp4"

    def test_no_ext_falls_back(self):
        dm = DownloadManager()
        assert dm._guess_ext("https://example.com/video", "mp4") == ".mp4"

    def test_unknown_type_fallback(self):
        dm = DownloadManager()
        result = dm._guess_ext("https://example.com/file", "text/html")
        assert result.startswith(".")


# ========== _get_sub_dir ==========

class TestGetSubDir:
    def test_video_type(self):
        dm = DownloadManager()
        path = dm._get_sub_dir("mp4")
        assert path.endswith("videos")

    def test_image_type(self):
        dm = DownloadManager()
        path = dm._get_sub_dir("png")
        assert path.endswith("images")

    def test_cover_type(self):
        dm = DownloadManager()
        path = dm._get_sub_dir("cover")
        assert path.endswith("covers")

    def test_unknown_type(self):
        dm = DownloadManager()
        path = dm._get_sub_dir("unknown")
        assert path.endswith("temp")


# ========== format_size ==========

class TestFormatSize:
    def test_bytes(self):
        assert DownloadManager.format_size(100) == "100B"

    def test_kilobytes(self):
        result = DownloadManager.format_size(2048)
        assert "KB" in result

    def test_megabytes(self):
        result = DownloadManager.format_size(5 * 1024 * 1024)
        assert "MB" in result


# ========== http property ==========

class TestHttpProperty:
    def test_lazy_init(self):
        dm = DownloadManager()
        client = dm.http
        assert client is not None
        assert dm._http is client

    def test_same_instance(self):
        dm = DownloadManager()
        c1 = dm.http
        c2 = dm.http
        assert c1 is c2


# ========== close ==========

@pytest.mark.asyncio
async def test_close(dl_manager):
    _ = dl_manager.http
    await dl_manager.close()
    assert dl_manager._http is None


# ========== download local path ==========

@pytest.mark.asyncio
async def test_download_local_path():
    dm = DownloadManager()
    result = await dm.download("/tmp/local-file.mp4")
    assert result.state == 1
    assert result.local_path == "/tmp/local-file.mp4"


# ========== download cache hit ==========

@pytest.mark.asyncio
async def test_download_cache_hit(dl_manager):
    from multi_publish.core.downloader import DownloadResult
    url = "https://example.com/cached-video.mp4"
    cached = DownloadResult(source_url=url, local_path="/tmp/cached-video.mp4", state=1)
    dl_manager._cache["my-cache-key"] = cached
    with patch("multi_publish.core.downloader.os.path.exists", return_value=True):
        result = await dl_manager.download(url, key="my-cache-key")
    assert result is cached
    assert result.state == 1


# ========== download with key ==========

@pytest.mark.asyncio
async def test_download_with_custom_key():
    dm = DownloadManager()
    result = await dm.download("", key="custom-key")
    assert result.source_url == ""


# ========== cache after failed attempt ==========

def test_cache_failed_retry(dl_manager):
    cached = dl_manager._cache.get("nonexistent-key")
    assert cached is None
