"""Tests for wechat_publisher models and exceptions."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from wechat_publisher.models import Article, PublishResult
from wechat_publisher.exceptions import (
    WeChatError, WeChatAuthError, WeChatAPIError,
    WeChatUploadError, WeChatPublishError, WeChatDraftError,
    WeChatConfigError, WeChatRateLimitError, WeChatNetworkError,
    raise_for_error_code,
)


class TestArticle:
    """Tests for Article dataclass."""

    def test_create_valid_article(self):
        article = Article(
            title="Test Article",
            content="<p>Content</p>",
            author="Test Author",
        )
        assert article.title == "Test Article"
        assert article.content == "<p>Content</p>"
        assert article.author == "Test Author"
        assert article.show_cover_pic == 1

    def test_title_required(self):
        with pytest.raises(ValueError, match="Article title is required"):
            Article(title="", content="<p>Content</p>")

    def test_content_required(self):
        with pytest.raises(ValueError, match="Article content is required"):
            Article(title="Test", content="")

    def test_title_truncated_to_64(self):
        long_title = "A" * 100
        article = Article(title=long_title, content="<p>Content</p>")
        assert len(article.title) == 64

    def test_author_truncated_to_64(self):
        long_author = "A" * 100
        article = Article(title="Test", content="<p>C</p>", author=long_author)
        assert len(article.author) == 64

    def test_digest_auto_generated_from_content(self):
        article = Article(title="Test", content="Hello World Content", digest=None)
        assert article.digest == "Hello World Content"
        assert len(article.digest) <= 64

    def test_digest_not_overridden_when_provided(self):
        article = Article(title="Test", content="Long content here", digest="Custom summary")
        assert article.digest == "Custom summary"

    def test_default_field_values(self):
        article = Article(title="Test", content="<p>C</p>")
        assert article.author is None
        assert article.digest == "C"  # auto-generated from stripped content
        assert article.content_source_url is None
        assert article.need_open_comment == 0
        assert article.only_fans_can_comment == 0
        assert article.show_cover_pic == 1


class TestPublishResult:
    """Tests for PublishResult dataclass."""

    def test_success_result(self):
        result = PublishResult(
            success=True,
            article_id="12345",
            article_url="http://mp.weixin.qq.com/test",
        )
        assert result.success is True
        assert result.article_id == "12345"
        assert result.article_url == "http://mp.weixin.qq.com/test"
        assert result.error_code is None

    def test_failure_result(self):
        result = PublishResult(
            success=False,
            error_code=-1,
            error_message="System error",
        )
        assert result.success is False
        assert result.error_code == -1
        assert result.error_message == "System error"

    def test_repr(self):
        result = PublishResult(success=True)
        assert "PublishResult" in repr(result)


class TestExceptions:
    """Tests for exception hierarchy."""

    def test_base_exception(self):
        err = WeChatError("test error", error_code=40001)
        assert str(err) == "[Error 40001] test error"
        assert err.error_code == 40001

    def test_auth_exception(self):
        err = WeChatAuthError("invalid token", error_code=40001)
        assert isinstance(err, WeChatError)

    def test_rate_limit_exception(self):
        err = WeChatRateLimitError(retry_after=60)
        assert "Rate limit" in str(err)
        assert err.retry_after == 60

    def test_api_exception(self):
        err = WeChatAPIError("bad request")
        assert isinstance(err, WeChatError)

    def test_error_code_auth(self):
        with pytest.raises(WeChatAuthError):
            raise_for_error_code(40001, "invalid appsecret")

    def test_error_code_rate_limit(self):
        with pytest.raises(WeChatRateLimitError):
            raise_for_error_code(45009, "api freq limit")

    def test_error_code_api(self):
        with pytest.raises(WeChatAPIError):
            raise_for_error_code(99999, "unknown error")

    def test_upload_error(self):
        err = WeChatUploadError("upload failed")
        assert isinstance(err, WeChatError)

    def test_publish_error(self):
        err = WeChatPublishError("draft publish failed")
        assert isinstance(err, WeChatError)

    def test_config_error(self):
        err = WeChatConfigError("missing appid")
        assert isinstance(err, WeChatError)

    def test_network_error(self):
        err = WeChatNetworkError("connection timeout")
        assert isinstance(err, WeChatError)

    def test_draft_error(self):
        err = WeChatDraftError("draft save failed")
        assert isinstance(err, WeChatError)

    def test_error_code_no_match(self):
        with pytest.raises(WeChatAPIError):
            raise_for_error_code(0, "success")
