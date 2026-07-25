"""旧 Python 发布器不得在默认桌面链路外落盘明文凭据。"""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from multi_publish.publishers.bilibili import BilibiliPublisher
from multi_publish.publishers.legacy_auth_policy import (
    legacy_plaintext_auth_enabled,
    require_legacy_plaintext_auth,
)
from multi_publish.publishers.xiaohongshu import XiaoHongShuPublisher


@pytest.mark.parametrize("publisher_cls", [BilibiliPublisher, XiaoHongShuPublisher])
def test_legacy_publishers_reject_plaintext_auth_save(tmp_path: Path, monkeypatch, publisher_cls):
    monkeypatch.delenv("MULTI_PUBLISH_ALLOW_LEGACY_PLAINTEXT_AUTH", raising=False)
    publisher = SimpleNamespace(
        _auth_data_path=str(tmp_path / "auth.json"),
        _cookie_path=str(tmp_path / "cookies.json"),
        _context=SimpleNamespace(),
        _page=SimpleNamespace(),
    )

    with pytest.raises(RuntimeError, match="明文认证持久化已停用"):
        asyncio.run(publisher_cls._save_auth_data(publisher))

    assert not (tmp_path / "auth.json").exists()
    assert not (tmp_path / "cookies.json").exists()


def test_legacy_plaintext_auth_requires_explicit_migration_mode(monkeypatch):
    monkeypatch.setenv("MULTI_PUBLISH_ALLOW_LEGACY_PLAINTEXT_AUTH", "1")
    monkeypatch.delenv("MULTI_PUBLISH_LEGACY_AUTH_MIGRATION", raising=False)
    monkeypatch.delenv("NODE_ENV", raising=False)

    assert not legacy_plaintext_auth_enabled()
    with pytest.raises(RuntimeError, match="明文认证持久化已停用"):
        require_legacy_plaintext_auth()


def test_legacy_plaintext_auth_is_disabled_in_production_even_when_migration_flags_are_set(monkeypatch):
    monkeypatch.setenv("MULTI_PUBLISH_ALLOW_LEGACY_PLAINTEXT_AUTH", "1")
    monkeypatch.setenv("MULTI_PUBLISH_LEGACY_AUTH_MIGRATION", "1")
    monkeypatch.setenv("NODE_ENV", "production")

    assert not legacy_plaintext_auth_enabled()
    with pytest.raises(RuntimeError, match="明文认证持久化已停用"):
        require_legacy_plaintext_auth()
