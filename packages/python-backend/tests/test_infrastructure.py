"""Tests for MultiPublish error hierarchy and retry/rate-limit infrastructure."""

import pytest
import time
from multi_publish._errors import (
    MultiPublishError, MultiPublishConfigError, MultiPublishConnectionError,
    MultiPublishTimeoutError, MultiPublishProxyError, MultiPublishHTTPError,
    MultiPublishAuthError, MultiPublishRateLimitError, MultiPublishServerError,
    MultiPublishValidationError, MultiPublishNotFoundError, _redact_headers,
)
from multi_publish._retries import RetryPolicy, DEFAULT_RETRY, AGGRESSIVE_RETRY, FAST_RETRY
from multi_publish._rate_limit import parse_retry_after


_HTTP_KWARGS = dict(status_code=200, method="GET", url="https://example.com/api")


class TestErrorHierarchy:
    """Verify error class hierarchy and constructor behavior."""

    def test_all_errors_are_multipublisherror(self):
        errors = [
            MultiPublishConfigError("cfg"),
            MultiPublishConnectionError("conn"),
            MultiPublishTimeoutError("timeout"),
            MultiPublishProxyError("proxy"),
            MultiPublishHTTPError("http", **_HTTP_KWARGS),
            MultiPublishAuthError("unauthorized", **_HTTP_KWARGS),
            MultiPublishRateLimitError("rate limited", **_HTTP_KWARGS),
            MultiPublishServerError(500, **_HTTP_KWARGS),
            MultiPublishValidationError("invalid", **_HTTP_KWARGS),
            MultiPublishNotFoundError("not found", **_HTTP_KWARGS),
        ]
        for err in errors:
            assert isinstance(err, MultiPublishError), f"{type(err).__name__} not a MultiPublishError"

    def test_http_error_status(self):
        err = MultiPublishHTTPError("not found", status_code=404, method="GET", url="https://example.com/api")
        assert err.status_code == 404
        assert "404" in str(err)

    def test_rate_limit_retry_after(self):
        err = MultiPublishRateLimitError("too fast", retry_after=30, **_HTTP_KWARGS)
        assert err.retry_after == 30

    def test_redact_headers_empty(self):
        assert _redact_headers(None) == {}
        assert _redact_headers({}) == {}

    def test_redact_headers_authorization(self):
        headers = {"Authorization": "Bearer secret123", "Content-Type": "application/json"}
        redacted = _redact_headers(headers)
        assert redacted["Authorization"] == "***"
        assert redacted["Content-Type"] == "application/json"


class TestRetryPolicy:
    """Verify RetryPolicy dataclass and behavior."""

    def test_default_policy(self):
        assert DEFAULT_RETRY.max_retries == 3
        assert DEFAULT_RETRY.backoff_base == 0.5

    def test_aggressive_policy(self):
        assert AGGRESSIVE_RETRY.max_retries == 5

    def test_fast_policy(self):
        assert FAST_RETRY.max_retries == 2

    def test_should_retry_connection_error(self):
        err = MultiPublishConnectionError("transient")
        assert DEFAULT_RETRY.should_retry(err, attempt=1)

    def test_should_not_retry_auth_error(self):
        err = MultiPublishAuthError("bad auth", **_HTTP_KWARGS)
        assert not DEFAULT_RETRY.should_retry(err, attempt=1)

    def test_should_not_retry_exhausted(self):
        err = MultiPublishConnectionError("still failing")
        assert not DEFAULT_RETRY.should_retry(err, attempt=3)

    def test_sleep_for_rate_limit(self):
        err = MultiPublishRateLimitError("too fast", retry_after=5, **_HTTP_KWARGS)
        delay = DEFAULT_RETRY.sleep_for(err, attempt=1)
        assert delay == 5.0

    def test_sleep_for_backoff_increases(self):
        err = MultiPublishConnectionError("transient")
        delay1 = DEFAULT_RETRY.sleep_for(err, attempt=1)
        delay2 = DEFAULT_RETRY.sleep_for(err, attempt=2)
        assert delay2 > delay1

    def test_sleep_for_bounded(self):
        err = MultiPublishConnectionError("transient")
        delay = DEFAULT_RETRY.sleep_for(err, attempt=10)
        assert delay <= DEFAULT_RETRY.backoff_max * 1.25  # jitter can push over max


class TestRateLimit:
    """Verify rate-limit header parsing."""

    def test_parse_retry_after_seconds(self):
        result = parse_retry_after({"retry-after": "30"})
        assert result == 30.0

    def test_parse_retry_after_none(self):
        assert parse_retry_after({}) is None

    def test_parse_ratelimit_reset(self):
        future = time.time() + 60
        result = parse_retry_after({"x-ratelimit-reset": str(future)})
        assert result is not None
        assert 55 < result < 65

    def test_parse_invalid_retry_after(self):
        assert parse_retry_after({"retry-after": "invalid"}) is None
