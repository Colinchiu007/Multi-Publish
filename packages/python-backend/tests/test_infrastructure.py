"""Tests for infrastructure modules: _errors, _rate_limit, _retries, _auth."""

import pytest

from multi_publish._auth import AuthMiddleware, BearerAuth
from multi_publish._errors import (
    MultiPublishAuthError,
    MultiPublishBadRequestError,
    MultiPublishConfigError,
    MultiPublishConnectionError,
    MultiPublishError,
    MultiPublishHTTPError,
    MultiPublishNotFoundError,
    MultiPublishPermissionError,
    MultiPublishPlatformError,
    MultiPublishRateLimitError,
    MultiPublishServerError,
    MultiPublishUpstreamError,
    MultiPublishValidationError,
    _redact_headers,
    http_error_for_status,
)
from multi_publish._rate_limit import parse_rate_limit_limit, parse_rate_limit_remaining, parse_retry_after
from multi_publish._retries import AGGRESSIVE_RETRY, DEFAULT_RETRY, FAST_RETRY, RetryPolicy

# ===== _errors Tests =====


class TestErrorHierarchy:
    def test_base_error(self):
        assert issubclass(MultiPublishConfigError, MultiPublishError)
        assert issubclass(MultiPublishConnectionError, MultiPublishError)
        assert issubclass(MultiPublishHTTPError, MultiPublishError)

    def test_http_error_subclasses(self):
        assert issubclass(MultiPublishAuthError, MultiPublishHTTPError)
        assert issubclass(MultiPublishRateLimitError, MultiPublishHTTPError)
        assert issubclass(MultiPublishServerError, MultiPublishHTTPError)

    def test_platform_error(self):
        assert issubclass(MultiPublishPlatformError, MultiPublishError)


class TestRedactHeaders:
    def test_none(self):
        assert _redact_headers(None) == {}

    def test_empty(self):
        assert _redact_headers({}) == {}

    def test_redacts_authorization(self):
        result = _redact_headers({"Authorization": "secret123"})
        assert result["Authorization"] == "***"

    def test_preserves_other(self):
        h = {"content-type": "application/json", "Authorization": "secret"}
        r = _redact_headers(h)
        assert r["content-type"] == "application/json"
        assert r["Authorization"] == "***"

    def test_case_insensitive(self):
        r = _redact_headers({"authorization": "tok"})
        assert r["authorization"] == "***"


class TestMultiPublishHTTPError:
    def test_init(self):
        e = MultiPublishHTTPError("err", status_code=404, method="GET", url="https://api.example.com/resource")
        assert e.status_code == 404
        assert e.method == "GET"

    def test_str_with_request_id(self):
        e = MultiPublishHTTPError("err", status_code=500, method="POST", url="/api", request_id="req-001")
        s = str(e)
        assert "500" in s and "req-001" in s

    def test_str_with_response_body(self):
        e = MultiPublishHTTPError("err", status_code=400, method="GET", url="/api", response_body='{"error":"bad"}')
        s = str(e)
        assert "bad" in s

    def test_empty_str(self):
        e = MultiPublishHTTPError("err", status_code=200, method="GET", url="/ok")
        assert str(e) is not None

    def test_headers_redacted(self):
        e = MultiPublishHTTPError("err", status_code=200, method="GET", url="/api", headers={"Authorization": "tok"})
        assert "tok" not in str(e)


class TestRateLimitError:
    def test_retry_after(self):
        e = MultiPublishRateLimitError("rate limit", status_code=429, method="GET", url="/api", retry_after=5.0)
        assert e.retry_after == 5.0


class TestPlatformError:
    def test_full(self):
        e = MultiPublishPlatformError("blocked", platform="weibo", platform_code=10086, retry_after=300)
        assert e.platform == "weibo"
        assert e.platform_code == 10086
        assert e.retry_after == 300


class TestHttpErrorForStatus:
    def test_400(self):
        e = http_error_for_status("bad", status_code=400, method="GET", url="/api")
        assert isinstance(e, MultiPublishBadRequestError)

    def test_401(self):
        e = http_error_for_status("unauth", status_code=401, method="GET", url="/api")
        assert isinstance(e, MultiPublishAuthError)

    def test_403(self):
        e = http_error_for_status("forbid", status_code=403, method="GET", url="/api")
        assert isinstance(e, MultiPublishPermissionError)

    def test_404(self):
        e = http_error_for_status("not found", status_code=404, method="GET", url="/api")
        assert isinstance(e, MultiPublishNotFoundError)

    def test_422(self):
        e = http_error_for_status("validation", status_code=422, method="GET", url="/api")
        assert isinstance(e, MultiPublishValidationError)

    def test_429(self):
        e = http_error_for_status({"retry_after": 30}, status_code=429, method="GET", url="/api")
        assert isinstance(e, MultiPublishRateLimitError)
        assert e.retry_after == 30.0

    def test_502(self):
        e = http_error_for_status("bad gateway", status_code=502, method="GET", url="/api")
        assert isinstance(e, MultiPublishUpstreamError)

    def test_503(self):
        e = http_error_for_status("unavail", status_code=503, method="GET", url="/api")
        assert isinstance(e, MultiPublishUpstreamError)

    def test_500(self):
        e = http_error_for_status("server error", status_code=500, method="GET", url="/api")
        assert isinstance(e, MultiPublishServerError)

    def test_999_unknown(self):
        e = http_error_for_status("unknown", status_code=999, method="GET", url="/api")
        assert isinstance(e, MultiPublishHTTPError)


# ===== _rate_limit Tests =====


class TestParseRetryAfter:
    def test_retry_after_header(self):
        assert parse_retry_after({"retry-after": "30"}) == 30.0

    def test_retry_after_capitalized(self):
        assert parse_retry_after({"Retry-After": "60"}) == 60.0

    def test_x_ratelimit_reset(self):
        import time

        future = time.time() + 120
        r = parse_retry_after({"x-ratelimit-reset": str(int(future))})
        assert r is not None and 110 <= r <= 130

    def test_no_header(self):
        assert parse_retry_after({}) is None

    def test_invalid_value(self):
        assert parse_retry_after({"retry-after": "never"}) is None

    def test_small_reset(self):
        r = parse_retry_after({"x-ratelimit-reset": "5"})
        assert r == 5.0


class TestParseRateLimitRemaining:
    def test_valid(self):
        assert parse_rate_limit_remaining({"x-ratelimit-remaining": "10"}) == 10

    def test_capitalized(self):
        assert parse_rate_limit_remaining({"X-RateLimit-Remaining": "5"}) == 5

    def test_missing(self):
        assert parse_rate_limit_remaining({}) is None

    def test_invalid(self):
        assert parse_rate_limit_remaining({"x-ratelimit-remaining": "abc"}) is None


class TestParseRateLimitLimit:
    def test_valid(self):
        assert parse_rate_limit_limit({"x-ratelimit-limit": "100"}) == 100

    def test_missing(self):
        assert parse_rate_limit_limit({}) is None


# ===== _retries Tests =====


class TestRetryPolicy:
    def test_defaults(self):
        p = RetryPolicy()
        assert p.max_retries == 3
        assert p.backoff_base == 0.5

    def test_should_retry_connection_error(self):
        p = RetryPolicy(max_retries=3)
        assert p.should_retry(MultiPublishConnectionError("err"), 1)

    def test_should_not_retry_after_max(self):
        p = RetryPolicy(max_retries=3)
        assert not p.should_retry(MultiPublishConnectionError("err"), 3)

    def test_should_not_retry_config_error(self):
        p = RetryPolicy(max_retries=3)
        assert not p.should_retry(MultiPublishConfigError("err"), 1)

    def test_sleep_for_rate_limit(self):
        p = RetryPolicy()
        e = MultiPublishRateLimitError("rl", status_code=429, method="GET", url="/api", retry_after=10.0)
        assert p.sleep_for(e, 1) == 10.0

    def test_sleep_for_backoff(self):
        p = RetryPolicy(jitter=0)
        delay = p.sleep_for(MultiPublishConnectionError("err"), 1)
        assert delay <= 1.0

    def test_default_policy_exists(self):
        assert isinstance(DEFAULT_RETRY, RetryPolicy)
        assert isinstance(AGGRESSIVE_RETRY, RetryPolicy)
        assert isinstance(FAST_RETRY, RetryPolicy)


# ===== _auth Tests =====


class TestBearerAuth:
    def test_init(self):
        a = BearerAuth("tok")
        assert a is not None

    def test_empty_token_raises(self):
        with pytest.raises(ValueError, match="non-empty"):
            BearerAuth("")

    def test_whitespace_token_raises(self):
        with pytest.raises(ValueError):
            BearerAuth("   ")

    def test_auth_flow_sets_header(self):
        import httpx

        a = BearerAuth("my-token")
        req = httpx.Request("GET", "https://example.com")
        result = list(a.auth_flow(req))
        assert len(result) == 1
        assert result[0].headers["Authorization"] == "Bearer my-token"

    def test_custom_scheme(self):
        import httpx

        a = BearerAuth("tok", scheme="Token")
        req = httpx.Request("GET", "https://example.com")
        result = list(a.auth_flow(req))
        assert result[0].headers["Authorization"] == "Token tok"


class TestAuthMiddleware:
    def test_defaults(self):
        m = AuthMiddleware()
        assert m.token is None
        assert m.get_header() == {}

    def test_init_with_token(self):
        m = AuthMiddleware(token="tok123")
        assert m.get_header() == {"Authorization": "Bearer tok123"}

    def test_set_token(self):
        m = AuthMiddleware()
        m.set_token("new-tok")
        assert m.get_header() == {"Authorization": "Bearer new-tok"}

    def test_set_empty_raises(self):
        m = AuthMiddleware()
        with pytest.raises(ValueError, match="non-empty"):
            m.set_token("")

    def test_clear(self):
        m = AuthMiddleware(token="tok")
        m.clear()
        assert m.token is None
        assert m.get_header() == {}
