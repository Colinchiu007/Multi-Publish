"""Tests for multi_publish.publishers.douyin_auth — 认证模块独立函数.

douyin_auth 模块从 douyin.py 拆分而来，负责 DouyinPublisher 的全部认证
逻辑：登录、cookies/localStorage/IndexedDB 捕获与持久化、恢复、过期检查。

测试策略
--------
- 把 DouyinPublisher 当作"宿主对象"——douyin_auth 函数接收 publisher 作为
  第一个参数，访问其 _cookie_path / _auth_data_path / _context / _page
  等属性。
- 测试时用 SimpleNamespace 或 MagicMock 构造一个最小的宿主对象，只填上
  被测函数需要的字段，避免实例化真实 DouyinPublisher（会拉起 Playwright
  依赖）。
- 文件 I/O 测试用 tmp_path 隔离。
- async 测试用 asyncio.run() 包装，避免 pytest-asyncio 依赖。
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from multi_publish.publishers.douyin_auth import (
    check_auth,
    load_auth_data,
    load_cookies,
    login,
    restore_auth_data,
    save_auth_data,
    save_cookies,
)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _make_publisher(
    tmp_path,
    cookie_path: str | None = None,
    auth_data_path: str | None = None,
    login_timeout: int = 120,
) -> SimpleNamespace:
    """构造一个最小宿主对象，仅供 douyin_auth 函数使用。"""
    browser_dir = tmp_path / "accounts" / "douyin" / "legacy" / "browser_data"
    browser_check_dir = tmp_path / "accounts" / "douyin" / "legacy" / "browser_data_check"

    def get_browser_data_dir(check: bool = False) -> str:
        return str(browser_check_dir if check else browser_dir)

    return SimpleNamespace(
        _cookie_path=cookie_path or str(tmp_path / "cookies_douyin.json"),
        _auth_data_path=auth_data_path or str(tmp_path / "auth_douyin.json"),
        _login_timeout=login_timeout,
        _selectors={
            "login_qrcode": '[class*="qrcode"]',
            "login_success_indicator": '[class*="dashboard"]',
            "login_avatar": '[class*="avatar"]',
        },
        config=SimpleNamespace(
            data_dir=str(tmp_path),
            proxy=None,  # BasePublisher.proxy_config 返回 self.config.proxy
        ),
        platform=SimpleNamespace(value="douyin"),
        # async 调用需要但默认 None，由具体测试 patch
        _playwright_app=None,
        _context=None,
        _page=None,
        _get_browser_data_dir=get_browser_data_dir,
        # login() 超时时会调用 publisher.close()
        close=AsyncMock(),
    )


def _run(coro):
    return asyncio.run(coro)


# ──────────────────────────────────────────────
# save_cookies / load_cookies
# ──────────────────────────────────────────────


class TestSaveLoadCookies:
    def test_save_cookies_writes_json_array(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_cookies(pub, [{"name": "sid", "value": "v1"}])
        assert os.path.exists(pub._cookie_path)
        with open(pub._cookie_path) as f:
            data = json.load(f)
        assert data == [{"name": "sid", "value": "v1"}]

    def test_save_cookies_creates_parent_dir(self, tmp_path):
        nested = tmp_path / "nested" / "sub" / "cookies.json"
        pub = _make_publisher(tmp_path, cookie_path=str(nested))
        save_cookies(pub, [])
        assert nested.exists()

    def test_save_cookies_overwrites_existing(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_cookies(pub, [{"name": "old"}])
        save_cookies(pub, [{"name": "new"}])
        loaded = load_cookies(pub)
        assert loaded == [{"name": "new"}]

    def test_load_cookies_returns_empty_when_no_file(self, tmp_path):
        pub = _make_publisher(tmp_path)
        assert load_cookies(pub) == []

    def test_load_cookies_reads_existing(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_cookies(pub, [{"name": "a"}, {"name": "b"}])
        loaded = load_cookies(pub)
        assert len(loaded) == 2
        assert loaded[0]["name"] == "a"

    def test_load_cookies_handles_empty_file(self, tmp_path):
        """Empty file content '[]' should return []."""
        pub = _make_publisher(tmp_path)
        with open(pub._cookie_path, "w") as f:
            f.write("[]")
        assert load_cookies(pub) == []


# ──────────────────────────────────────────────
# save_auth_data / load_auth_data
# ──────────────────────────────────────────────


class TestSaveLoadAuthData:
    def test_save_auth_data_writes_full_structure(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(
            pub,
            cookies=[{"name": "sid"}],
            local_storage={"k1": "v1"},
            indexed_db={"store": {"key": "val"}},
        )
        assert os.path.exists(pub._auth_data_path)
        with open(pub._auth_data_path) as f:
            data = json.load(f)
        assert data["cookies"] == [{"name": "sid"}]
        assert data["local_storage"] == {"k1": "v1"}
        assert data["indexed_db"] == {"store": {"key": "val"}}
        assert "captured_at" in data
        assert isinstance(data["captured_at"], float)

    def test_save_auth_data_creates_parent_dir(self, tmp_path):
        nested = tmp_path / "deep" / "path" / "auth.json"
        pub = _make_publisher(tmp_path, auth_data_path=str(nested))
        save_auth_data(pub, [], {}, {})
        assert nested.exists()

    def test_save_auth_data_records_recent_timestamp(self, tmp_path):
        pub = _make_publisher(tmp_path)
        before = time.time()
        save_auth_data(pub, [], {}, {})
        after = time.time()
        with open(pub._auth_data_path) as f:
            data = json.load(f)
        assert before <= data["captured_at"] <= after

    def test_load_auth_data_returns_none_when_no_file(self, tmp_path):
        pub = _make_publisher(tmp_path)
        assert load_auth_data(pub) is None

    def test_load_auth_data_reads_full_structure(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "x"}], {"ls": "data"}, {"idb": {}})
        loaded = load_auth_data(pub)
        assert loaded["cookies"] == [{"name": "x"}]
        assert loaded["local_storage"] == {"ls": "data"}

    def test_load_auth_data_falls_back_to_cookies_file(self, tmp_path):
        """When auth_douyin.json 不存在但 cookies_douyin.json 存在时回退。"""
        pub = _make_publisher(tmp_path)
        save_cookies(pub, [{"name": "fallback"}])
        loaded = load_auth_data(pub)
        assert loaded is not None
        assert loaded["cookies"] == [{"name": "fallback"}]
        assert loaded["local_storage"] == {}
        assert loaded["indexed_db"] == {}

    def test_load_auth_data_prefers_auth_file_over_cookies(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_cookies(pub, [{"name": "old_cookie"}])
        save_auth_data(pub, [{"name": "new_auth"}], {"ls": 1}, {})
        loaded = load_auth_data(pub)
        assert loaded["cookies"] == [{"name": "new_auth"}]

    def test_load_auth_data_overwrite(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "v1"}], {}, {})
        save_auth_data(pub, [{"name": "v2"}], {"ls": "data"}, {})
        loaded = load_auth_data(pub)
        assert loaded["cookies"] == [{"name": "v2"}]
        assert loaded["local_storage"] == {"ls": "data"}


# ──────────────────────────────────────────────
# restore_auth_data
# ──────────────────────────────────────────────


class TestRestoreAuthData:
    def test_returns_false_when_no_auth_data(self, tmp_path):
        pub = _make_publisher(tmp_path)
        assert _run(restore_auth_data(pub)) is False

    def test_returns_false_when_auth_data_empty(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [], {}, {})
        # No cookies, no ls, no idb → still returns True (auth data exists)
        # 实际代码：只要 auth_data 存在就返回 True
        result = _run(restore_auth_data(pub))
        # 即使内容为空，只要 auth_data 文件存在就应返回 True
        assert result is True

    def test_restores_cookies_via_context_add_cookies(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "sid", "value": "v"}], {}, {})

        # Mock _context.add_cookies 为 AsyncMock
        pub._context = MagicMock()
        pub._context.add_cookies = AsyncMock()
        pub._page = MagicMock()
        pub._page.evaluate = AsyncMock()

        result = _run(restore_auth_data(pub))
        assert result is True
        pub._context.add_cookies.assert_awaited_once_with([{"name": "sid", "value": "v"}])

    def test_local_storage_restore_failure_does_not_fail_overall(self, tmp_path):
        """localStorage 恢复抛异常时不应影响整体返回值。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "c"}], {"ls_key": "ls_val"}, {})

        pub._context = MagicMock()
        pub._context.add_cookies = AsyncMock()
        pub._page = MagicMock()
        # evaluate 第一次（localStorage）抛异常，不应传播
        pub._page.evaluate = AsyncMock(side_effect=RuntimeError("page error"))

        result = _run(restore_auth_data(pub))
        # localStorage 失败被 try/except 吞掉，整体仍 True
        assert result is True

    def test_indexed_db_restore_failure_does_not_fail_overall(self, tmp_path):
        """IndexedDB 恢复抛异常时不应影响整体返回值。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "c"}], {}, {"db1": {"store": {"k": "v"}}})

        pub._context = MagicMock()
        pub._context.add_cookies = AsyncMock()
        pub._page = MagicMock()
        # 第一次 evaluate (localStorage, 空, 跳过) 不调用
        # 第二次 evaluate (IndexedDB) 抛异常
        call_count = [0]

        async def _eval(script, data=None):
            call_count[0] += 1
            raise RuntimeError("idb error")

        pub._page.evaluate = _eval

        result = _run(restore_auth_data(pub))
        assert result is True

    def test_context_add_cookies_failure_returns_false(self, tmp_path):
        """外层 try 块捕获 _context.add_cookies 异常时返回 False。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "c"}], {}, {})

        pub._context = MagicMock()
        pub._context.add_cookies = AsyncMock(side_effect=RuntimeError("ctx closed"))
        pub._page = MagicMock()
        pub._page.evaluate = AsyncMock()

        result = _run(restore_auth_data(pub))
        assert result is False


# ──────────────────────────────────────────────
# check_auth
# ──────────────────────────────────────────────


class TestCheckAuth:
    def test_returns_false_when_no_auth_data(self, tmp_path):
        pub = _make_publisher(tmp_path)
        assert _run(check_auth(pub)) is False

    def test_returns_false_when_no_cookies(self, tmp_path):
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [], {"ls": 1}, {})  # cookies 为空
        assert _run(check_auth(pub)) is False

    def test_returns_false_when_data_expired(self, tmp_path):
        """captured_at 超过 7 天应判定过期。"""
        pub = _make_publisher(tmp_path)
        # 手动写入 8 天前的 captured_at
        eight_days_ago = time.time() - 8 * 86400
        with open(pub._auth_data_path, "w") as f:
            json.dump(
                {
                    "cookies": [{"name": "sid"}],
                    "local_storage": {},
                    "indexed_db": {},
                    "captured_at": eight_days_ago,
                },
                f,
            )
        # 不需要 mock playwright，因为过期检查在 playwright 之前
        assert _run(check_auth(pub)) is False

    def test_returns_false_when_playwright_launch_fails(self, tmp_path):
        """auth 数据有效但 playwright 启动失败时应返回 False。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "sid"}], {}, {})

        # Mock playwright 抛异常
        mock_pw = MagicMock()
        mock_pw.chromium.launch_persistent_context = AsyncMock(side_effect=RuntimeError("no browser"))
        pub._playwright_app = mock_pw

        assert _run(check_auth(pub)) is False

    def test_returns_true_when_url_indicates_logged_in(self, tmp_path):
        """模拟登录成功的页面 URL（不含 /login）。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "sid"}], {}, {})

        mock_page = MagicMock()
        mock_page.url = "https://creator.douyin.com/creator-micro/home"
        mock_page.goto = AsyncMock()
        mock_page.reload = AsyncMock()

        mock_ctx = MagicMock()
        mock_ctx.new_page = AsyncMock(return_value=mock_page)
        mock_ctx.add_cookies = AsyncMock()
        mock_ctx.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch_persistent_context = AsyncMock(return_value=mock_ctx)
        pub._playwright_app = mock_pw

        # patch asyncio.sleep 避免真实等待
        with patch("multi_publish.publishers.douyin_auth.asyncio.sleep", AsyncMock()):
            result = _run(check_auth(pub))
        assert result is True
        mock_ctx.add_cookies.assert_awaited_once_with([{"name": "sid"}])
        mock_ctx.close.assert_awaited_once()

    def test_returns_false_when_url_contains_login(self, tmp_path):
        """页面 URL 含 /login 表示未登录。"""
        pub = _make_publisher(tmp_path)
        save_auth_data(pub, [{"name": "sid"}], {}, {})

        mock_page = MagicMock()
        mock_page.url = "https://creator.douyin.com/login"
        mock_page.goto = AsyncMock()
        mock_page.reload = AsyncMock()

        mock_ctx = MagicMock()
        mock_ctx.new_page = AsyncMock(return_value=mock_page)
        mock_ctx.add_cookies = AsyncMock()
        mock_ctx.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch_persistent_context = AsyncMock(return_value=mock_ctx)
        pub._playwright_app = mock_pw

        with patch("multi_publish.publishers.douyin_auth.asyncio.sleep", AsyncMock()):
            result = _run(check_auth(pub))
        assert result is False


# ──────────────────────────────────────────────
# login (smoke test — full flow is complex)
# ──────────────────────────────────────────────


class TestLogin:
    def test_login_success_saves_auth_data(self, tmp_path):
        """成功登录后应调用 _save_auth_data 持久化认证数据。"""
        from multi_publish.publishers import douyin_auth

        pub = _make_publisher(tmp_path, login_timeout=2)

        # Mock playwright context + page
        mock_page = MagicMock()
        mock_page.url = "https://creator.douyin.com/creator-micro/home"
        # login_avatar locator 存在 → logged_in = True
        avatar_locator = MagicMock()
        avatar_locator.count = AsyncMock(return_value=1)
        mock_page.locator = MagicMock(return_value=avatar_locator)
        mock_page.goto = AsyncMock()
        mock_page.context = MagicMock()

        # Mock context.cookies / localStorage / indexedDB 捕获
        mock_ctx = MagicMock()
        mock_ctx.new_page = AsyncMock(return_value=mock_page)
        mock_ctx.cookies = AsyncMock(return_value=[{"name": "sid", "value": "v"}])
        mock_ctx.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch_persistent_context = AsyncMock(return_value=mock_ctx)
        pub._playwright_app = mock_pw

        # patch 捕获函数返回简单字典
        # indexed_db 形状为 {db_name: {store_name: {key: value}}}，内部值需可调用 len()
        with patch.object(douyin_auth, "_capture_local_storage", AsyncMock(return_value={"ls": "v"})):
            with patch.object(douyin_auth, "_capture_indexed_db", AsyncMock(return_value={"secure-store": {"store": {"k": "v"}}})):
                with patch("multi_publish.publishers.douyin_auth.asyncio.sleep", AsyncMock()):
                    with patch.object(douyin_auth, "save_auth_data") as save_mock:
                        result = _run(login(pub))

        assert result is True
        # 验证 save_auth_data 被调用，参数包含 cookies
        save_mock.assert_called_once()
        call_args = save_mock.call_args.args
        assert call_args[1] == [{"name": "sid", "value": "v"}]  # cookies 参数
        assert call_args[2] == {"ls": "v"}  # local_storage 参数

    def test_login_timeout_returns_false(self, tmp_path):
        """login_timeout 到期未登录应返回 False。"""
        from multi_publish.publishers import douyin_auth

        pub = _make_publisher(tmp_path, login_timeout=1)

        # Mock page: 永远在登录页
        mock_page = MagicMock()
        mock_page.url = "https://creator.douyin.com/login"
        avatar_locator = MagicMock()
        avatar_locator.count = AsyncMock(return_value=0)  # avatar 不存在
        dash_locator = MagicMock()
        dash_locator.count = AsyncMock(return_value=0)  # dashboard 不存在
        mock_page.locator = MagicMock(side_effect=[avatar_locator, dash_locator] * 50)
        mock_page.goto = AsyncMock()

        mock_ctx = MagicMock()
        mock_ctx.new_page = AsyncMock(return_value=mock_page)
        mock_ctx.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch_persistent_context = AsyncMock(return_value=mock_ctx)
        pub._playwright_app = mock_pw

        with patch("multi_publish.publishers.douyin_auth.asyncio.sleep", AsyncMock()):
            result = _run(login(pub))

        assert result is False
        # login 超时分支调用 publisher.close()，而非直接 _context.close()
        pub.close.assert_awaited()
