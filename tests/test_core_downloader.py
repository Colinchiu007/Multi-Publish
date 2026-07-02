"""Core module test - DownloadManager"""
import pytest
import asyncio
import tempfile
from unittest.mock import AsyncMock, patch
from multi_publish.core.downloader import (
    DownloadManager,
    DownloadResult,
)


@pytest.fixture
def dl_manager():
    return DownloadManager(
        download_dir=tempfile.mkdtemp(),
        max_concurrent=3,
    )


class TestDownloadResult:
    def test_defaults(self):
        r = DownloadResult(source_url="https://example.com/video.mp4")
        assert r.source_url == "https://example.com/video.mp4"
        assert r.local_path == ""
        assert r.state == 0

    def test_full_init(self):
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


class TestDownloadManager:
    def test_init(self, dl_manager):
        assert dl_manager.max_concurrent == 3
        assert dl_manager.max_retries == 3
        assert len(dl_manager._cache) == 0

    def test_is_downloading_new_url(self, dl_manager):
        assert dl_manager.is_downloading("https://example.com/v.mp4") is False

    def test_clear_cache(self, dl_manager):
        dl_manager._cache["test-key"] = "/tmp/test-file"
        dl_manager.clear_cache()
        assert len(dl_manager._cache) == 0

    def test_get_cache_size(self, dl_manager):
        size = dl_manager.get_cache_size()
        assert size >= 0

    def test_format_size(self, dl_manager):
        result = dl_manager.format_size(100)
        assert "B" in result or "100" in result

    def test_concurrent_limit(self, dl_manager):
        assert dl_manager._semaphore._value == 3