"""账号存储路径穿越保护测试。"""

from pathlib import Path

import pytest

from multi_publish.publishers.account_paths import build_account_storage_paths


def test_account_storage_path_stays_inside_expected_root(tmp_path):
    paths = build_account_storage_paths(tmp_path, "douyin", "account-1")

    assert paths.account_dir == tmp_path / "accounts" / "douyin" / "account-1"
    assert paths.auth_file.parent == paths.account_dir
    assert paths.cookie_file.parent == paths.account_dir


@pytest.mark.parametrize("account_id", ["../escape", "..", "/absolute", "a/b", r"a\b", ""])
def test_account_storage_path_rejects_invalid_account_id(tmp_path, account_id):
    with pytest.raises(ValueError, match="账号 ID 格式无效"):
        build_account_storage_paths(tmp_path, "douyin", account_id)


@pytest.mark.parametrize("platform", ["Douyin", "../douyin", "douyin/path", ""])
def test_account_storage_path_rejects_invalid_platform(tmp_path, platform):
    with pytest.raises(ValueError, match="平台标识格式无效"):
        build_account_storage_paths(Path(tmp_path), platform, "account-1")


def test_account_storage_path_rejects_existing_symlink_escape(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    platform_dir = tmp_path / "accounts" / "douyin"
    platform_dir.mkdir(parents=True)
    link = platform_dir / "account-1"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"当前环境不允许创建目录符号链接: {error}")

    with pytest.raises(ValueError, match="账号目录超出数据根目录"):
        build_account_storage_paths(tmp_path, "douyin", "account-1")
