"""Tests for wechat_publisher/client.py (Phase 5.6).

Covers WechatPublisher class — auth, media upload, draft CRUD, publish flow,
status query, context manager, and the NotImplementedError on publish_url.

All HTTP calls are mocked via httpx.MockTransport — no real network.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import httpx
import pytest

from wechat_publisher.client import WechatPublisher
from wechat_publisher.exceptions import (
    WeChatAPIError,
    WeChatAuthError,
    WeChatConfigError,
    WeChatDraftError,
    WeChatNetworkError,
    WeChatPublishError,
    WeChatRateLimitError,
    WeChatUploadError,
)
from wechat_publisher.models import Article


# ──────────────────────────────────────────────
# Fixtures / helpers
# ──────────────────────────────────────────────


def _make_publisher(
    access_token: str | None = "valid_token",
    token_valid: bool = True,
    auto_refresh: bool = True,
    max_retries: int = 2,
) -> WechatPublisher:
    """Build a WechatPublisher with a pre-injected token (skips refresh)."""
    pub = WechatPublisher(
        appid="wx1234567890abcdef",
        secret="test_secret",
        access_token=access_token,
        auto_refresh_token=auto_refresh,
        max_retries=max_retries,
    )
    if token_valid:
        pub._token_expires_at = datetime.now() + timedelta(hours=2)
    return pub


def _mock_response(json_data: dict, status_code: int = 200) -> httpx.Response:
    """Build a real httpx.Response so raise_for_status() works."""
    return httpx.Response(
        status_code=status_code,
        json=json_data,
        request=httpx.Request("GET", "http://test"),
    )


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    """Avoid real time.sleep during retry tests."""
    monkeypatch.setattr("wechat_publisher.client.time.sleep", lambda _s: None)


# ──────────────────────────────────────────────
# __init__ / config validation
# ──────────────────────────────────────────────


class TestInit:
    def test_requires_appid_and_secret(self):
        with pytest.raises(WeChatConfigError, match="WECHAT_APPID and WECHAT_APPSECRET"):
            WechatPublisher(appid=None, secret=None)

    def test_requires_secret_when_only_appid(self):
        with pytest.raises(WeChatConfigError):
            WechatPublisher(appid="wx123", secret=None)

    def test_accepts_explicit_credentials(self):
        pub = WechatPublisher(appid="wx123", secret="secret")
        assert pub.appid == "wx123"
        assert pub.secret == "secret"

    def test_reads_env_vars(self, monkeypatch):
        monkeypatch.setenv("WECHAT_APPID", "env_appid")
        monkeypatch.setenv("WECHAT_APPSECRET", "env_secret")
        pub = WechatPublisher()
        assert pub.appid == "env_appid"
        assert pub.secret == "env_secret"

    def test_default_max_retries(self):
        pub = WechatPublisher(appid="wx", secret="s")
        assert pub.max_retries == 3

    def test_custom_max_retries(self):
        pub = WechatPublisher(appid="wx", secret="s", max_retries=5)
        assert pub.max_retries == 5

    def test_auto_refresh_token_default_true(self):
        pub = WechatPublisher(appid="wx", secret="s")
        assert pub.auto_refresh_token is True

    def test_auto_refresh_token_false(self):
        pub = WechatPublisher(appid="wx", secret="s", auto_refresh_token=False)
        assert pub.auto_refresh_token is False


# ──────────────────────────────────────────────
# access_token property / _is_token_valid
# ──────────────────────────────────────────────


class TestAccessToken:
    def test_returns_cached_token_when_valid(self):
        pub = _make_publisher(access_token="cached", token_valid=True)
        assert pub.access_token == "cached"

    def test_refreshes_when_expired(self):
        pub = _make_publisher(access_token="old", token_valid=False, auto_refresh=True)
        with patch.object(pub, "_refresh_access_token") as m:
            # _refresh sets _access_token internally; simulate by side effect
            def _set():
                pub._access_token = "refreshed"
            m.side_effect = _set
            assert pub.access_token == "refreshed"
            m.assert_called_once()

    def test_raises_when_expired_and_no_auto_refresh(self):
        pub = _make_publisher(access_token="old", token_valid=False, auto_refresh=False)
        with pytest.raises(WeChatAuthError, match="auto_refresh_token is disabled"):
            _ = pub.access_token

    def test_is_token_valid_false_when_no_token(self):
        pub = WechatPublisher(appid="wx", secret="s")
        assert pub._is_token_valid() is False

    def test_is_token_valid_false_when_no_expiry(self):
        pub = WechatPublisher(appid="wx", secret="s", access_token="x")
        assert pub._is_token_valid() is False

    def test_is_token_valid_true_within_buffer(self):
        pub = WechatPublisher(appid="wx", secret="s", access_token="x")
        pub._token_expires_at = datetime.now() + timedelta(hours=1)
        assert pub._is_token_valid() is True

    def test_is_token_valid_false_within_5min_buffer(self):
        pub = WechatPublisher(appid="wx", secret="s", access_token="x")
        pub._token_expires_at = datetime.now() + timedelta(minutes=3)
        assert pub._is_token_valid() is False


# ──────────────────────────────────────────────
# _refresh_access_token
# ──────────────────────────────────────────────


class TestRefreshAccessToken:
    def test_success_sets_token_and_expiry(self):
        pub = WechatPublisher(appid="wx", secret="s")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "access_token": "new_token",
            "expires_in": 7200,
        }
        with patch.object(pub._client, "get", return_value=mock_response):
            pub._refresh_access_token()
        assert pub._access_token == "new_token"
        assert pub._token_expires_at is not None

    def test_api_error_raises_auth_error(self):
        pub = WechatPublisher(appid="wx", secret="s")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"errcode": 40013, "errmsg": "invalid appid"}
        with patch.object(pub._client, "get", return_value=mock_response):
            with pytest.raises(WeChatAuthError):
                pub._refresh_access_token()

    def test_http_error_raises_network_error(self):
        pub = WechatPublisher(appid="wx", secret="s")
        with patch.object(pub._client, "get", side_effect=httpx.HTTPError("network down")):
            with pytest.raises(WeChatNetworkError):
                pub._refresh_access_token()

    def test_unexpected_exception_raises_auth_error(self):
        pub = WechatPublisher(appid="wx", secret="s")
        with patch.object(pub._client, "get", side_effect=RuntimeError("boom")):
            with pytest.raises(WeChatAuthError):
                pub._refresh_access_token()


# ──────────────────────────────────────────────
# _make_request
# ──────────────────────────────────────────────


class TestMakeRequest:
    def test_get_returns_json(self):
        pub = _make_publisher()
        with patch.object(pub._client, "get", return_value=_mock_response({"foo": "bar"})):
            result = pub._make_request("GET", "/test")
        assert result == {"foo": "bar"}

    def test_post_json(self):
        pub = _make_publisher()
        with patch.object(pub._client, "post", return_value=_mock_response({"ok": 1})):
            result = pub._make_request("POST", "/test", json_data={"x": 1})
        assert result == {"ok": 1}

    def test_post_files(self):
        pub = _make_publisher()
        with patch.object(pub._client, "post", return_value=_mock_response({"ok": 1})) as m:
            result = pub._make_request("POST", "/upload", files={"f": b"x"})
        assert result == {"ok": 1}
        # verify files kwarg was forwarded
        assert m.call_args.kwargs.get("files") is not None

    def test_post_form_data(self):
        pub = _make_publisher()
        with patch.object(pub._client, "post", return_value=_mock_response({"ok": 1})) as m:
            pub._make_request("POST", "/form", data={"k": "v"})
        assert m.call_args.kwargs.get("data") == {"k": "v"}

    def test_unsupported_method_raises_api_error(self):
        """Unsupported method ValueError is caught and wrapped as WeChatAPIError."""
        pub = _make_publisher()
        with pytest.raises(WeChatAPIError, match="Unsupported HTTP method"):
            pub._make_request("DELETE", "/x")

    def test_injects_access_token_param(self):
        pub = _make_publisher(access_token="inj_token")
        with patch.object(pub._client, "get", return_value=_mock_response({})) as m:
            pub._make_request("GET", "/x")
        assert m.call_args.kwargs["params"]["access_token"] == "inj_token"

    def test_token_error_triggers_refresh_and_retry(self):
        pub = _make_publisher(access_token="old")
        # First call returns 40001 (token expired), second returns success
        responses = [
            _mock_response({"errcode": 40001, "errmsg": "invalid token"}),
            _mock_response({"ok": True}),
        ]
        with patch.object(pub._client, "get", side_effect=responses):
            with patch.object(pub, "_refresh_access_token") as refresh:
                result = pub._make_request("GET", "/x")
        assert result == {"ok": True}
        refresh.assert_called_once()

    def test_rate_limit_retries(self):
        pub = _make_publisher()
        responses = [
            _mock_response({"errcode": 45009, "errmsg": "rate limited"}),
            _mock_response({"ok": True}),
        ]
        with patch.object(pub._client, "get", side_effect=responses):
            result = pub._make_request("GET", "/x")
        assert result == {"ok": True}

    def test_rate_limit_exhausted_raises(self):
        pub = _make_publisher(max_retries=1)
        with patch.object(pub._client, "get", return_value=_mock_response({"errcode": 45009, "errmsg": "rate"})):
            with pytest.raises(WeChatRateLimitError):
                pub._make_request("GET", "/x")

    def test_http_status_error_retries(self):
        pub = _make_publisher()
        err = httpx.HTTPStatusError(
            "500", request=httpx.Request("GET", "http://x"), response=httpx.Response(500)
        )
        with patch.object(pub._client, "get", side_effect=[err, _mock_response({"ok": True})]):
            result = pub._make_request("GET", "/x")
        assert result == {"ok": True}

    def test_http_status_error_exhausted_raises_network_error(self):
        pub = _make_publisher(max_retries=1)
        err = httpx.HTTPStatusError(
            "500", request=httpx.Request("GET", "http://x"), response=httpx.Response(500)
        )
        with patch.object(pub._client, "get", side_effect=err):
            with pytest.raises(WeChatNetworkError):
                pub._make_request("GET", "/x")

    def test_http_error_retries_then_raises_network(self):
        pub = _make_publisher(max_retries=1)
        with patch.object(pub._client, "get", side_effect=httpx.HTTPError("conn")):
            with pytest.raises(WeChatNetworkError):
                pub._make_request("GET", "/x")


# ──────────────────────────────────────────────
# upload_cover / upload_image
# ──────────────────────────────────────────────


class TestUploadCover:
    def test_missing_file_raises(self, tmp_path):
        pub = _make_publisher()
        with pytest.raises(WeChatUploadError, match="Image file not found"):
            pub.upload_cover(image_path=tmp_path / "nonexistent.jpg")

    def test_invalid_image_raises(self, tmp_path):
        pub = _make_publisher()
        bad = tmp_path / "bad.txt"
        bad.write_text("not an image", encoding="utf-8")
        with pytest.raises(WeChatUploadError, match="Invalid image file"):
            pub.upload_cover(image_path=bad)

    def test_success_returns_media_id(self, tmp_path):
        pub = _make_publisher()
        img = tmp_path / "cover.jpg"
        # Minimal valid JPEG header (not a real image, but is_valid_image_file checks extension/mime)
        img.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"media_id": "media_123"}
        with patch.object(pub._client, "post", return_value=mock_response):
            media_id = pub.upload_cover(image_path=img)
        assert media_id == "media_123"

    def test_missing_media_id_raises(self, tmp_path):
        pub = _make_publisher()
        img = tmp_path / "cover.jpg"
        img.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"errcode": 0}
        with patch.object(pub._client, "post", return_value=mock_response):
            with pytest.raises(WeChatUploadError, match="no media_id"):
                pub.upload_cover(image_path=img)

    def test_download_from_url_when_no_path(self, tmp_path):
        pub = _make_publisher()
        with patch.object(pub, "_download_image") as dl:
            dl.return_value = tmp_path / "dl.jpg"
            (tmp_path / "dl.jpg").write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")
            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            mock_response.json.return_value = {"media_id": "m1"}
            with patch.object(pub._client, "post", return_value=mock_response):
                pub.upload_cover(image_url="https://x.com/cover.jpg")
        dl.assert_called_once_with("https://x.com/cover.jpg")


class TestUploadImage:
    def test_missing_file_raises(self, tmp_path):
        pub = _make_publisher()
        with pytest.raises(WeChatUploadError, match="Image file not found"):
            pub.upload_image(tmp_path / "nope.jpg")

    def test_success_returns_url(self, tmp_path):
        pub = _make_publisher()
        img = tmp_path / "in_article.jpg"
        img.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"url": "https://mmbiz.qpic.cn/test"}
        with patch.object(pub._client, "post", return_value=mock_response):
            url = pub.upload_image(img)
        assert url == "https://mmbiz.qpic.cn/test"

    def test_missing_url_raises(self, tmp_path):
        pub = _make_publisher()
        img = tmp_path / "bad.jpg"
        img.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"errcode": 0}
        with patch.object(pub._client, "post", return_value=mock_response):
            with pytest.raises(WeChatUploadError, match="no URL"):
                pub.upload_image(img)


# ──────────────────────────────────────────────
# _download_image
# ──────────────────────────────────────────────


class TestDownloadImage:
    def test_downloads_to_temp_file(self, tmp_path):
        pub = _make_publisher()
        mock_response = MagicMock()
        mock_response.content = b"\xff\xd8\xff\xe0binary"
        mock_response.raise_for_status.return_value = None
        # _download_image uses tempfile.gettempdir() to build the
        # output dir. Redirect it to tmp_path so the test writes
        # inside the pytest tmp dir and we can verify the file
        # actually lands on disk.
        with patch.object(pub._client, "get", return_value=mock_response):
            with patch("wechat_publisher.client.tempfile.gettempdir", return_value=str(tmp_path)):
                result = pub._download_image("https://x.com/a.jpg")
        # Returns a Path inside the redirected temp dir
        assert isinstance(result, Path)
        assert str(result).startswith(str(tmp_path))
        assert result.exists()
        assert result.read_bytes() == b"\xff\xd8\xff\xe0binary"


# ──────────────────────────────────────────────
# create_draft / delete_draft / update_draft
# ──────────────────────────────────────────────


def _make_article() -> Article:
    return Article(title="Test Title", content="<p>content</p>")


class TestCreateDraft:
    def test_success_returns_draft(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"media_id": "draft_1"}):
            draft = pub.create_draft(_make_article())
        assert draft.media_id == "draft_1"

    def test_missing_media_id_raises(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"errcode": 0}):
            with pytest.raises(WeChatDraftError, match="no media_id"):
                pub.create_draft(_make_article())

    def test_request_exception_wrapped_as_draft_error(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            with pytest.raises(WeChatDraftError, match="Failed to create draft"):
                pub.create_draft(_make_article())


class TestDeleteDraft:
    def test_success_returns_true(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"errcode": 0}):
            assert pub.delete_draft("m1") is True

    def test_exception_returns_false(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            assert pub.delete_draft("m1") is False


class TestUpdateDraft:
    def test_success_returns_true(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"errcode": 0}):
            assert pub.update_draft("m1", _make_article()) is True

    def test_exception_returns_false(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            assert pub.update_draft("m1", _make_article()) is False


# ──────────────────────────────────────────────
# publish / _free_publish / _mass_publish
# ──────────────────────────────────────────────


class TestPublish:
    def test_no_article_no_draft_raises(self):
        pub = _make_publisher()
        with pytest.raises(WeChatPublishError, match="Either article or draft_id"):
            pub.publish()

    def test_unsupported_type_raises(self):
        pub = _make_publisher()
        with pytest.raises(WeChatPublishError, match="Unsupported publish_type"):
            pub.publish(draft_id="d1", publish_type="bogus")

    def test_article_creates_draft_then_publishes(self):
        pub = _make_publisher()
        with patch.object(pub, "create_draft") as cd:
            cd.return_value = MagicMock(media_id="auto_draft")
            with patch.object(pub, "_free_publish") as fp:
                fp.return_value = MagicMock(success=True)
                pub.publish(article=_make_article(), publish_type="free")
        cd.assert_called_once()
        fp.assert_called_once_with("auto_draft")

    def test_draft_id_skips_create_draft(self):
        pub = _make_publisher()
        with patch.object(pub, "create_draft") as cd:
            with patch.object(pub, "_free_publish") as fp:
                fp.return_value = MagicMock(success=True)
                pub.publish(draft_id="d1", publish_type="free")
        cd.assert_not_called()
        fp.assert_called_once_with("d1")

    def test_mass_publish_dispatches(self):
        pub = _make_publisher()
        with patch.object(pub, "_mass_publish") as mp:
            mp.return_value = MagicMock(success=True)
            pub.publish(draft_id="d1", publish_type="mass")
        mp.assert_called_once_with("d1")


class TestFreePublish:
    def test_success_returns_success_result(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"publish_id": "p1"}):
            result = pub._free_publish("d1")
        assert result.success is True
        assert result.publish_id == "p1"

    def test_exception_returns_error_result(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            result = pub._free_publish("d1")
        assert result.success is False


class TestMassPublish:
    def test_success_returns_success_result(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={"msg_id": "msg1"}):
            result = pub._mass_publish("d1")
        assert result.success is True

    def test_exception_returns_error_result(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            result = pub._mass_publish("d1")
        assert result.success is False


# ──────────────────────────────────────────────
# get_publish_status
# ──────────────────────────────────────────────


class TestGetPublishStatus:
    def test_success(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", return_value={
            "publish_status": 0,
            "article_id": "a1",
            "article_url": "https://mp.weixin.qq.com/s/a1",
        }):
            status = pub.get_publish_status("p1")
        assert status.publish_id == "p1"
        assert status.status == 0
        assert status.article_url == "https://mp.weixin.qq.com/s/a1"

    def test_exception_returns_failed_status(self):
        pub = _make_publisher()
        with patch.object(pub, "_make_request", side_effect=RuntimeError("boom")):
            status = pub.get_publish_status("p1")
        assert status.status == 2  # Failed
        assert status.fail_reason


# ──────────────────────────────────────────────
# publish_url (NotImplementedError)
# ──────────────────────────────────────────────


class TestPublishUrl:
    def test_raises_not_implemented(self):
        pub = _make_publisher()
        with pytest.raises(NotImplementedError, match="not directly supported"):
            pub.publish_url("https://mp.weixin.qq.com/s/abc")

    def test_error_message_mentions_publish_method(self):
        pub = _make_publisher()
        with pytest.raises(NotImplementedError, match="publish\\(\\)"):
            pub.publish_url("https://x")


# ──────────────────────────────────────────────
# close / context manager
# ──────────────────────────────────────────────


class TestCloseAndContextManager:
    def test_close_closes_http_client(self):
        pub = _make_publisher()
        with patch.object(pub._client, "close") as m:
            pub.close()
        m.assert_called_once()

    def test_enter_returns_self(self):
        pub = _make_publisher()
        assert pub.__enter__() is pub

    def test_exit_calls_close(self):
        pub = _make_publisher()
        with patch.object(pub, "close") as m:
            pub.__exit__(None, None, None)
        m.assert_called_once()

    def test_with_statement_works(self):
        with patch("wechat_publisher.client.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            with WechatPublisher(appid="wx", secret="s") as pub:
                assert pub is not None
            mock_client.close.assert_called_once()
