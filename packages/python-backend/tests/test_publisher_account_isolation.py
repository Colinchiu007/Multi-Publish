"""平台发布器账号凭证与浏览器目录隔离测试。"""

from pathlib import Path

import pytest

from multi_publish.models import PlatformType
from multi_publish.publishers.base import PublisherConfig
from multi_publish.publishers.bilibili import BilibiliPublisher
from multi_publish.publishers.douyin import DouyinPublisher
from multi_publish.publishers.xiaohongshu import XiaoHongShuPublisher


@pytest.mark.parametrize(
    ("publisher_class", "platform"),
    [
        (DouyinPublisher, PlatformType.DOUYIN),
        (BilibiliPublisher, PlatformType.BILIBILI),
        (XiaoHongShuPublisher, PlatformType.XIAOHONGSHU),
    ],
)
def test_platform_credentials_use_account_scoped_directory(tmp_path, publisher_class, platform):
    config = PublisherConfig(platform=platform, data_dir=str(tmp_path))
    account_a = publisher_class(config=config, account_id="account-a")
    account_b = publisher_class(config=config, account_id="account-b")
    expected_a = tmp_path / "accounts" / platform.value / "account-a"

    assert Path(account_a._auth_data_path) == expected_a / "auth.json"
    assert Path(account_a._cookie_path) == expected_a / "cookies.json"
    assert Path(account_a._get_browser_data_dir()) == expected_a / "browser_data"
    assert account_a._auth_data_path != account_b._auth_data_path
    assert account_a._get_browser_data_dir() != account_b._get_browser_data_dir()


@pytest.mark.parametrize(
    ("publisher_class", "platform"),
    [
        (DouyinPublisher, PlatformType.DOUYIN),
        (BilibiliPublisher, PlatformType.BILIBILI),
        (XiaoHongShuPublisher, PlatformType.XIAOHONGSHU),
    ],
)
def test_account_id_rejects_path_traversal(tmp_path, publisher_class, platform):
    config = PublisherConfig(platform=platform, data_dir=str(tmp_path))

    with pytest.raises(ValueError, match="账号 ID"):
        publisher_class(config=config, account_id="../other-user")
