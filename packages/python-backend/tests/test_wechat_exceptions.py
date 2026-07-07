"""Tests for wechat_publisher/exceptions."""
import pytest
from wechat_publisher.exceptions import (
    WeChatError, WeChatAuthError, WeChatAPIError, WeChatUploadError,
    WeChatPublishError, WeChatDraftError, WeChatConfigError,
    WeChatRateLimitError, WeChatNetworkError, raise_for_error_code,
)


class TestWeChatError:
    def test_message(self):
        e = WeChatError("test error")
        assert str(e) == "test error"

    def test_with_error_code(self):
        e = WeChatError("err", error_code=40001)
        assert "[Error 40001]" in str(e)

    def test_error_info(self):
        e = WeChatError("err", error_code=1, error_info={"detail": "x"})
        assert e.error_info["detail"] == "x"


class TestErrorHierarchy:
    def test_auth_subclass(self):
        assert issubclass(WeChatAuthError, WeChatError)

    def test_api_subclass(self):
        assert issubclass(WeChatAPIError, WeChatError)

    def test_upload_subclass(self):
        assert issubclass(WeChatUploadError, WeChatError)

    def test_publish_subclass(self):
        assert issubclass(WeChatPublishError, WeChatError)

    def test_draft_subclass(self):
        assert issubclass(WeChatDraftError, WeChatError)

    def test_config_subclass(self):
        assert issubclass(WeChatConfigError, WeChatError)

    def test_rate_limit_subclass(self):
        assert issubclass(WeChatRateLimitError, WeChatError)

    def test_network_subclass(self):
        assert issubclass(WeChatNetworkError, WeChatError)

    def test_all_distinct(self):
        classes = [WeChatAuthError, WeChatAPIError, WeChatUploadError,
                   WeChatPublishError, WeChatDraftError, WeChatConfigError,
                   WeChatRateLimitError, WeChatNetworkError]
        assert len(set(classes)) == len(classes)


class TestWeChatRateLimitError:
    def test_default_message(self):
        e = WeChatRateLimitError()
        assert "Rate limit" in str(e)

    def test_retry_after(self):
        e = WeChatRateLimitError(retry_after=60)
        assert e.retry_after == 60


class TestRaiseForErrorCode:
    def test_40001_auth(self):
        with pytest.raises(WeChatAuthError, match="Invalid access_token"):
            raise_for_error_code(40001, "bad token")

    def test_40125_auth(self):
        with pytest.raises(WeChatAuthError):
            raise_for_error_code(40125, "bad secret")

    def test_42001_expired(self):
        with pytest.raises(WeChatAuthError):
            raise_for_error_code(42001, "expired")

    def test_45009_rate_limit(self):
        with pytest.raises(WeChatRateLimitError, match="Rate limit"):
            raise_for_error_code(45009, "too many requests")

    def test_99999_api_error(self):
        with pytest.raises(WeChatAPIError):
            raise_for_error_code(99999, "unknown error")

    def test_unknown_code_api_error(self):
        with pytest.raises(WeChatAPIError):
            raise_for_error_code(0, "no error code")
