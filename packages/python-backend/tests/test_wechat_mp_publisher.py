"""Tests for multi_publish.publishers.wechat_mp.WeChatPublisher.

覆盖 WeChatPublisher 全部方法（async），使用 asyncio.run() 包装以避免
对 pytest-asyncio 的依赖（项目当前未安装 pytest-asyncio）。

测试策略
--------
- HTTP 层全部 mock：用 unittest.mock.AsyncMock 替换 ``self._http`` 的
  get/post 调用，避免真实网络请求。
- 验证 access_token 缓存：构造一个已缓存的 token + 未来过期时间，验证
  ``_get_access_token`` 不会发起 HTTP 请求。
- 验证 publish 主流程的三条路径：草稿模式 / 正式发布成功 / 正式发布失败
  回退草稿。
- 验证错误包装：所有 RuntimeError/Exception 都应被 publish() 转换为
  PublishResult(success=False, error=...)。
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from multi_publish.models import PlatformType, PublishResult
from multi_publish.publishers.base import PublisherConfig
from multi_publish.publishers.wechat_mp import (
    WeChatArticle,
    WeChatPublisher,
    WeChatPublisherConfig,
)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _make_config(
    app_id: str = "wx_test_appid",
    app_secret: str = "wx_test_secret",
) -> WeChatPublisherConfig:
    return WeChatPublisherConfig(
        platform=PlatformType.WECHAT_MP,
        app_id=app_id,
        app_secret=app_secret,
    )


def _make_publisher(
    app_id: str = "wx_test_appid",
    app_secret: str = "wx_test_secret",
    account_id: str | None = None,
) -> WeChatPublisher:
    pub = WeChatPublisher(_make_config(app_id, app_secret), account_id=account_id)
    # 注入 mock http client，避免 initialize() 真实创建 httpx.AsyncClient
    pub._http = MagicMock()
    pub._http.get = AsyncMock()
    pub._http.post = AsyncMock()
    pub._http.aclose = AsyncMock()
    return pub


def _mock_json_response(json_data: dict) -> MagicMock:
    """Build a mock httpx.Response with .json() returning json_data."""
    resp = MagicMock()
    resp.json.return_value = json_data
    return resp


def _run(coro):
    """Run an async coroutine to completion in a fresh event loop."""
    return asyncio.run(coro)


# ──────────────────────────────────────────────
# Config & Article dataclasses
# ──────────────────────────────────────────────


class TestWeChatPublisherConfig:
    def test_defaults(self):
        cfg = WeChatPublisherConfig(platform=PlatformType.WECHAT_MP)
        assert cfg.app_id == ""
        assert cfg.app_secret == ""
        assert cfg.ip_white_list is None

    def test_explicit_values(self):
        cfg = WeChatPublisherConfig(
            platform=PlatformType.WECHAT_MP,
            app_id="id_x",
            app_secret="sec_x",
            ip_white_list=["1.2.3.4"],
        )
        assert cfg.app_id == "id_x"
        assert cfg.app_secret == "sec_x"
        assert cfg.ip_white_list == ["1.2.3.4"]

    def test_inherits_publisher_config(self):
        assert issubclass(WeChatPublisherConfig, PublisherConfig)


class TestWeChatArticle:
    def test_required_title(self):
        art = WeChatArticle(title="T")
        assert art.title == "T"
        assert art.author == ""
        assert art.digest == ""
        assert art.content == ""

    def test_full_fields(self):
        art = WeChatArticle(
            title="T",
            author="A",
            digest="D",
            content="<p>c</p>",
            content_source_url="https://x",
            cover_url="https://cover",
            content_style={"color": "red"},
        )
        assert art.author == "A"
        assert art.content == "<p>c</p>"
        assert art.content_style == {"color": "red"}


# ──────────────────────────────────────────────
# __init__ / platform / initialize
# ──────────────────────────────────────────────


class TestInit:
    def test_platform_property(self):
        pub = _make_publisher()
        assert pub.platform == PlatformType.WECHAT_MP

    def test_initial_state(self):
        pub = _make_publisher(account_id="acc1")
        assert pub.account_id == "acc1"
        assert pub._access_token == ""
        assert pub._token_expires_at == 0
        assert pub._http is not None

    def test_initialize_creates_http_client(self):
        pub = WeChatPublisher(_make_config())
        assert pub._http is None
        # initialize 会替换 _http；先 patch AsyncClient 构造避免真实依赖
        with patch("multi_publish.publishers.wechat_mp.httpx.AsyncClient") as mock_cls:
            mock_cls.return_value = MagicMock()
            _run(pub.initialize())
            mock_cls.assert_called_once()
        assert pub._http is not None


# ──────────────────────────────────────────────
# _get_access_token
# ──────────────────────────────────────────────


class TestGetAccessToken:
    def test_returns_cached_token_without_http(self):
        pub = _make_publisher()
        pub._access_token = "cached_token"
        pub._token_expires_at = time.time() + 3600  # 未过期
        # 不应触发任何 HTTP 请求
        token = _run(pub._get_access_token())
        assert token == "cached_token"
        pub._http.get.assert_not_called()

    def test_refreshes_when_expired(self):
        pub = _make_publisher()
        pub._access_token = "old"
        pub._token_expires_at = time.time() - 10  # 已过期
        pub._http.get.return_value = _mock_json_response(
            {"access_token": "new_token", "expires_in": 7200}
        )
        token = _run(pub._get_access_token())
        assert token == "new_token"
        assert pub._access_token == "new_token"
        # 过期时间应设置为 now + expires_in - 300
        assert pub._token_expires_at > time.time() + 6000

    def test_refreshes_when_no_token(self):
        pub = _make_publisher()
        assert pub._access_token == ""
        pub._http.get.return_value = _mock_json_response(
            {"access_token": "fresh", "expires_in": 7200}
        )
        token = _run(pub._get_access_token())
        assert token == "fresh"

    def test_missing_app_id_raises_value_error(self):
        pub = _make_publisher(app_id="", app_secret="")
        with pytest.raises(ValueError, match="AppID 或 AppSecret 未配置"):
            _run(pub._get_access_token())

    def test_api_error_raises_runtime_error(self):
        pub = _make_publisher()
        pub._http.get.return_value = _mock_json_response(
            {"errcode": 40013, "errmsg": "invalid appid"}
        )
        with pytest.raises(RuntimeError, match="获取 access_token 失败"):
            _run(pub._get_access_token())

    def test_default_expires_in_used_when_missing(self):
        pub = _make_publisher()
        pub._http.get.return_value = _mock_json_response({"access_token": "t"})
        token = _run(pub._get_access_token())
        assert token == "t"
        # 默认 7200 秒，提前 300 秒，所以过期时间应大于 now + 6000
        assert pub._token_expires_at > time.time() + 6000


# ──────────────────────────────────────────────
# _upload_image
# ──────────────────────────────────────────────


class TestUploadImage:
    def test_success_returns_media_id(self, tmp_path):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        img = tmp_path / "cover.jpg"
        img.write_bytes(b"\xff\xd8\xff\xe0fakejpg")

        # patch _get_access_token 避免触发 token 刷新
        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response({"media_id": "media_123"})
            media_id = _run(pub._upload_image(str(img)))
        assert media_id == "media_123"

    def test_file_too_large_raises_value_error(self, tmp_path):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        img = tmp_path / "big.jpg"
        img.write_bytes(b"x" * (2 * 1024 * 1024 + 1))  # 2MB + 1 字节

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with pytest.raises(ValueError, match="2MB"):
                _run(pub._upload_image(str(img)))

    def test_missing_media_id_raises_runtime_error(self, tmp_path):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        img = tmp_path / "cover.jpg"
        img.write_bytes(b"\xff\xd8small")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response(
                {"errcode": 40007, "errmsg": "invalid media"}
            )
            with pytest.raises(RuntimeError, match="上传图片失败"):
                _run(pub._upload_image(str(img)))


# ──────────────────────────────────────────────
# _create_draft
# ──────────────────────────────────────────────


class TestCreateDraft:
    def test_success_returns_media_id(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        article = WeChatArticle(title="T", content="<p>c</p>", cover_url="cover_id")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response({"media_id": "draft_m1"})
            draft_id = _run(pub._create_draft(article))
        assert draft_id == "draft_m1"

    def test_missing_media_id_raises_runtime_error(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        article = WeChatArticle(title="T", content="c")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response(
                {"errcode": 45009, "errmsg": "rate limit"}
            )
            with pytest.raises(RuntimeError, match="新建草稿失败"):
                _run(pub._create_draft(article))

    def test_digest_falls_back_to_title(self):
        """When article.digest is empty, _create_draft should use title[:120]."""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        article = WeChatArticle(title="MyTitle", content="c", digest="")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response({"media_id": "m"})
            _run(pub._create_draft(article))
        # 验证 POST body 中 digest 字段
        call_kwargs = pub._http.post.call_args.kwargs
        sent_body = call_kwargs["json"]
        assert sent_body["articles"][0]["digest"] == "MyTitle"

    def test_show_cover_pic_reflects_cover_url(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        article_with_cover = WeChatArticle(title="T", content="c", cover_url="cid")
        article_no_cover = WeChatArticle(title="T", content="c")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response({"media_id": "m"})
            _run(pub._create_draft(article_with_cover))
            assert pub._http.post.call_args.kwargs["json"]["articles"][0]["show_cover_pic"] == 1

            _run(pub._create_draft(article_no_cover))
            assert pub._http.post.call_args.kwargs["json"]["articles"][0]["show_cover_pic"] == 0


# ──────────────────────────────────────────────
# _publish_draft
# ──────────────────────────────────────────────


class TestPublishDraft:
    def test_success_with_article_url(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response(
                {"errmsg": "ok", "article_url": "https://mp.weixin.qq.com/s/abc"}
            )
            result = _run(pub._publish_draft("draft_id_1"))
        assert result["success"] is True
        assert result["article_url"] == "https://mp.weixin.qq.com/s/abc"

    def test_success_without_article_url(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response({"errmsg": "ok"})
            result = _run(pub._publish_draft("draft_id_1"))
        assert result["success"] is True
        assert result["message"] == "发布成功"

    def test_permission_error_mentions_enterprise(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response(
                {"errmsg": "invalid permission for publish"}
            )
            with pytest.raises(RuntimeError, match="权限不足"):
                _run(pub._publish_draft("draft_id_1"))

    def test_generic_error_raises_runtime_error(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            pub._http.post.return_value = _mock_json_response(
                {"errmsg": "system error"}
            )
            with pytest.raises(RuntimeError, match="发布草稿失败"):
                _run(pub._publish_draft("draft_id_1"))


# ──────────────────────────────────────────────
# publish (main flow)
# ──────────────────────────────────────────────


class TestPublish:
    def test_draft_mode_returns_success_without_publishing(self):
        """draft=True 应仅创建草稿，不调用 _publish_draft。"""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(pub, "_create_draft", AsyncMock(return_value="draft_m1")) as cd:
                with patch.object(pub, "_publish_draft", AsyncMock()) as pd:
                    result = _run(pub.publish("标题", "<p>c</p>", draft=True))
        assert isinstance(result, PublishResult)
        assert result.success is True
        assert result.article_id == "draft_m1"
        assert result.url is None
        cd.assert_awaited_once()
        pd.assert_not_awaited()

    def test_publish_mode_calls_publish_draft(self):
        """draft=False 应在创建草稿后调用 _publish_draft。"""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(pub, "_create_draft", AsyncMock(return_value="draft_m1")):
                with patch.object(
                    pub,
                    "_publish_draft",
                    AsyncMock(return_value={"success": True, "article_url": "https://x"}),
                ) as pd:
                    result = _run(pub.publish("标题", "<p>c</p>", draft=False))
        assert result.success is True
        assert result.url == "https://x"
        assert result.article_id == "draft_m1"
        pd.assert_awaited_once()

    def test_publish_failure_falls_back_to_draft_success(self):
        """_publish_draft 抛 RuntimeError 时应回退为 success=True + url=None + error=..."""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(pub, "_create_draft", AsyncMock(return_value="draft_m1")):
                with patch.object(
                    pub,
                    "_publish_draft",
                    AsyncMock(side_effect=RuntimeError("权限不足")),
                ):
                    result = _run(pub.publish("标题", "<p>c</p>", draft=False))
        # 回退策略：草稿已保存，正式发布失败但整体仍视为 success=True
        assert result.success is True
        assert result.article_id == "draft_m1"
        assert result.url is None
        assert "权限不足" in (result.error or "")

    def test_create_draft_failure_returns_failure(self):
        """_create_draft 抛异常时整体应返回 success=False。"""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(
                pub,
                "_create_draft",
                AsyncMock(side_effect=RuntimeError("新建草稿失败: rate limit")),
            ):
                result = _run(pub.publish("标题", "<p>c</p>", draft=False))
        assert result.success is False
        assert "新建草稿失败" in (result.error or "")
        assert result.platform == PlatformType.WECHAT_MP.value

    def test_cover_image_upload_invoked(self, tmp_path):
        """有 cover_image 时应先调用 _upload_image。"""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600
        img = tmp_path / "cover.jpg"
        img.write_bytes(b"\xff\xd8small")

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(pub, "_upload_image", AsyncMock(return_value="cover_media")) as up:
                with patch.object(pub, "_create_draft", AsyncMock(return_value="d1")):
                    with patch.object(
                        pub,
                        "_publish_draft",
                        AsyncMock(return_value={"success": True, "article_url": "u"}),
                    ):
                        _run(pub.publish("标题", "c", cover_image=str(img), draft=False))
        up.assert_awaited_once()

    def test_result_duration_recorded(self):
        """PublishResult.duration 应非负。"""
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="tok")):
            with patch.object(pub, "_create_draft", AsyncMock(return_value="d1")):
                result = _run(pub.publish("标题", "c", draft=True))
        assert result.duration >= 0


# ──────────────────────────────────────────────
# validate / check_auth
# ──────────────────────────────────────────────


class TestValidateAndCheckAuth:
    def test_validate_success(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        pub._token_expires_at = time.time() + 3600

        with patch.object(pub, "_get_access_token", AsyncMock(return_value="abcdefghijklmnopqrstuvwxyz123456")):
            result = _run(pub.validate())
        assert result["valid"] is True
        assert "认证成功" in result["message"]
        # token_preview 应截取前 20 字符
        assert result["token_preview"].startswith("abcdefghijklmnopqrst")
        assert result["token_preview"].endswith("...")

    def test_validate_failure_returns_invalid(self):
        pub = _make_publisher()
        with patch.object(
            pub,
            "_get_access_token",
            AsyncMock(side_effect=RuntimeError("auth failed")),
        ):
            result = _run(pub.validate())
        assert result["valid"] is False
        assert "auth failed" in result["message"]

    def test_check_auth_true_when_token_obtainable(self):
        pub = _make_publisher()
        with patch.object(pub, "_get_access_token", AsyncMock(return_value="t")):
            assert _run(pub.check_auth()) is True

    def test_check_auth_false_on_exception(self):
        pub = _make_publisher()
        with patch.object(
            pub,
            "_get_access_token",
            AsyncMock(side_effect=RuntimeError("nope")),
        ):
            assert _run(pub.check_auth()) is False


# ──────────────────────────────────────────────
# close
# ──────────────────────────────────────────────


class TestClose:
    def test_close_acloses_http_and_clears_token(self):
        pub = _make_publisher()
        pub._access_token = "tok"
        http_mock = pub._http  # close() 会把 pub._http 置 None，先保存引用
        _run(pub.close())
        http_mock.aclose.assert_awaited_once()
        assert pub._http is None
        assert pub._access_token == ""

    def test_close_when_http_none_is_noop(self):
        pub = WeChatPublisher(_make_config())
        assert pub._http is None
        # 不应抛异常
        _run(pub.close())
        assert pub._access_token == ""
