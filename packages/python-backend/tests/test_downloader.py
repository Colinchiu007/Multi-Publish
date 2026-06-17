"""Tests for DownloadManager — real API v3"""
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