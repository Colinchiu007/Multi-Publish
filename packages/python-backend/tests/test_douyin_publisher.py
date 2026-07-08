"""Tests for douyin.py — sync pure functions and file I/O."""

from __future__ import annotations

import os

from pytest import fixture

from multi_publish.models import PlatformType
from multi_publish.publishers.base import PublisherConfig
from multi_publish.publishers.douyin import DouyinPublisher


@fixture
def config(tmp_path) -> PublisherConfig:
    return PublisherConfig(
        platform=PlatformType.DOUYIN,
        data_dir=str(tmp_path),
        headless=True,
    )


@fixture
def publisher(config) -> DouyinPublisher:
    return DouyinPublisher(config)


@fixture
def publisher_with_account(config) -> DouyinPublisher:
    return DouyinPublisher(config, account_id="test_acc_123")


class TestPlatform:
    """platform property returns correct PlatformType."""

    def test_returns_douyin(self, publisher):
        assert publisher.platform == PlatformType.DOUYIN

    def test_is_enum_value(self, publisher):
        assert publisher.platform.value == "douyin"


class TestGetBrowserDataDir:
    """_get_browser_data_dir() path computation."""

    def test_without_account_id(self, publisher):
        result = publisher._get_browser_data_dir()
        assert result == os.path.join(publisher.config.data_dir, "browser_data")

    def test_with_account_id(self, publisher_with_account):
        result = publisher_with_account._get_browser_data_dir()
        assert "test_acc_123" in result

    def test_check_suffix(self, publisher):
        result = publisher._get_browser_data_dir(check=True)
        assert result.endswith("_check")

    def test_with_account_and_check(self, publisher_with_account):
        result = publisher_with_account._get_browser_data_dir(check=True)
        assert "test_acc_123" in result
        assert "_check" in result


class TestSaveLoadCookies:
    """_save_cookies() and _load_cookies() round-trip."""

    def test_save_and_load(self, publisher):
        cookies = [{"name": "sessionid", "value": "abc123"}]
        publisher._save_cookies(cookies)
        loaded = publisher._load_cookies()
        assert loaded == cookies

    def test_load_empty_when_no_file(self, publisher):
        assert publisher._load_cookies() == []

    def test_multiple_cookies(self, publisher):
        cookies = [
            {"name": "sid_tt", "value": "xxx"},
            {"name": "sessionid", "value": "yyy"},
        ]
        publisher._save_cookies(cookies)
        loaded = publisher._load_cookies()
        assert len(loaded) == 2

    def test_overwrite(self, publisher):
        publisher._save_cookies([{"name": "old"}])
        publisher._save_cookies([{"name": "new"}])
        loaded = publisher._load_cookies()
        assert loaded == [{"name": "new"}]


class TestSaveLoadAuthData:
    """_save_auth_data() and _load_auth_data() round-trip."""

    def test_save_and_load(self, publisher):
        auth = {
            "cookies": [{"name": "sessionid", "value": "abc"}],
            "local_storage": {"key": "value"},
            "indexed_db": {"store": {"k": "v"}},
        }
        publisher._save_auth_data(auth["cookies"], auth["local_storage"], auth["indexed_db"])
        loaded = publisher._load_auth_data()
        assert loaded["cookies"] == auth["cookies"]
        assert loaded["local_storage"] == auth["local_storage"]

    def test_load_none_when_no_files(self, publisher):
        assert publisher._load_auth_data() is None

    def test_fallback_to_cookies(self, publisher):
        """When auth file does not exist but cookies file does."""
        publisher._save_cookies([{"name": "fallback"}])
        loaded = publisher._load_auth_data()
        assert loaded is not None
        assert loaded["cookies"] == [{"name": "fallback"}]
        assert loaded["local_storage"] == {}

    def test_auth_data_includes_timestamp(self, publisher):
        publisher._save_auth_data([], {}, {})
        loaded = publisher._load_auth_data()
        assert "captured_at" in loaded
        assert isinstance(loaded["captured_at"], float)

    def test_overwrite_auth_file(self, publisher):
        publisher._save_auth_data([{"name": "v1"}], {}, {})
        publisher._save_auth_data([{"name": "v2"}], {"ls": "data"}, {})
        loaded = publisher._load_auth_data()
        assert loaded["cookies"] == [{"name": "v2"}]
        assert loaded["local_storage"] == {"ls": "data"}
