"""Tests for DownloadManager ? merged (new + legacy)"""

import tempfile

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
