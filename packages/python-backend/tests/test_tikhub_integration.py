"""Tests for auth middleware, pagination, TikHubBridge, and precheck."""

import httpx
import pytest

from multi_publish._auth import AuthMiddleware, BearerAuth
from multi_publish._pagination import CursorPaginator, OffsetPaginator, Page
from multi_publish.precheck import DuplicateCheck, PreCheckEngine
from multi_publish.tikhub_bridge import TikHubBridge, TikHubBridgeError


class TestAuthMiddleware:
    def test_bearer_auth_creds(self):
        auth = BearerAuth("test-token")
        req = auth.auth_flow(httpx.Request("GET", "https://example.com"))
        r = list(req)[0]
        assert r.headers.get("Authorization") == "Bearer test-token"

    def test_bearer_auth_empty_token(self):
        with pytest.raises(ValueError, match="empty"):
            BearerAuth("")

    def test_auth_middleware(self):
        mw = AuthMiddleware(token="tok", scheme="Bearer")
        assert mw.token == "tok"
        assert mw.scheme == "Bearer"

    def test_auth_middleware_clear(self):
        mw = AuthMiddleware(token="tok")
        mw.clear()
        assert mw.token is None


class TestPagination:
    def test_offset_paginator(self):
        p = OffsetPaginator()
        params = p.build_params(page=1, page_size=20)
        assert params == {"page": 1, "page_size": 20}

    def test_offset_paginator_has_next(self):
        p = OffsetPaginator()
        assert p.has_next(21, page=1, page_size=20) is True
        assert p.has_next(20, page=1, page_size=20) is False

    def test_cursor_paginator(self):
        p = CursorPaginator()
        params = p.build_params(cursor="abc", page_size=20)
        assert params == {"cursor": "abc", "page_size": 20}

    def test_cursor_paginator_no_cursor(self):
        p = CursorPaginator()
        params = p.build_params(cursor=None, page_size=20)
        assert "cursor" not in params or params.get("cursor") is None

    def test_page_model(self):
        page = Page(items=[1, 2, 3], total=10, page=1, page_size=20, has_more=True)
        assert page.items == [1, 2, 3]
        assert page.total == 10
        assert page.has_more is True


class TestTikHubBridge:
    def test_creates_client_with_api_key(self):
        bridge = TikHubBridge(api_key="test-key")
        assert bridge.api_key == "test-key"
        assert bridge._client is None

    def test_check_platform_supported(self):
        bridge = TikHubBridge(api_key="test")
        assert bridge.is_platform_supported("douyin") is False  # API disabled
        assert bridge.is_platform_supported("xiaohongshu") is False  # API disabled

    def test_unsupported_platform_raises(self):
        bridge = TikHubBridge(api_key="test")
        with pytest.raises(TikHubBridgeError):
            bridge.get_resource("invalid_platform_xyz")

    def test_get_resource_douyin(self):
        bridge = TikHubBridge(api_key="test")
        with pytest.raises(TikHubBridgeError):
            bridge.get_resource("douyin")


class TestPreCheckEngine:
    def test_duplicate_check_creation(self):
        dc = DuplicateCheck(title="test", platform="douyin")
        assert dc.title == "test"
        assert dc.platform == "douyin"

    def test_precheck_engine_creation(self):
        bridge = TikHubBridge(api_key="test")
        engine = PreCheckEngine(tikhub_bridge=bridge)
        assert engine._bridge is not None
