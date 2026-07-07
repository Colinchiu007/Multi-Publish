"""Extended tests for HttpClient deep error paths."""
import httpx
import pytest
import respx

from multi_publish._errors import (
    MultiPublishConnectionError,
    MultiPublishHTTPError,
    MultiPublishProxyError,
    MultiPublishTimeoutError,
)
from multi_publish._http_client import HttpClient
from multi_publish._retries import RetryPolicy


class TestHttpClientMapHttpxError:
    """Cover _map_httpx_error which converts httpx.HTTPStatusError."""

    @respx.mock
    def test_httpx_status_error_triggers_map(self):
        """Trigger httpx.HTTPStatusError with max_retries=1 (1 attempt, 0 retries)."""
        rm = respx
        rm.get("https://example.com/map-test").respond(500, text="error")
        with pytest.raises(MultiPublishHTTPError):
            HttpClient(retry_policy=RetryPolicy(max_retries=1)).get("https://example.com/map-test")

    @respx.mock
    def test_httpx_status_error_with_request_id(self):
        """_map_httpx_error with x-request-id header."""
        rm = respx
        rm.get("https://example.com/with-rid").respond(
            500, text="oops", headers={"x-request-id": "req-123"}
        )
        with pytest.raises(MultiPublishHTTPError):
            HttpClient(retry_policy=RetryPolicy(max_retries=1)).get("https://example.com/with-rid")

    @respx.mock
    def test_httpx_status_error_with_json(self):
        """_map_httpx_error with JSON response body."""
        rm = respx
        rm.get("https://example.com/json-err").respond(
            403, json={"error": "forbidden", "code": "ACCESS_DENIED"}
        )
        with pytest.raises(MultiPublishHTTPError) as exc:
            HttpClient(retry_policy=RetryPolicy(max_retries=1)).get("https://example.com/json-err")
        assert "forbidden" in str(exc.value) or "403" in str(exc.value)


class TestHttpClientRetryExhaustionFinal:
    """Cover the final raise after all retries exhausted."""

    @respx.mock
    def test_retry_exhaustion_after_all_attempts(self):
        """max_retries=2 means 3 attempts total, all fail with ConnectError."""
        rm = respx
        rm.get("https://example.com/all-fail").mock(side_effect=httpx.ConnectError("dead"))
        with pytest.raises(MultiPublishConnectionError, match="Connection error"):
            HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/all-fail")


class TestHttpClientAsyncErrorPaths:
    """Cover async error paths for timeout, proxy, connection errors."""

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_timeout_error(self):
        rm = respx
        rm.get("https://example.com/async-timeout").mock(side_effect=httpx.TimeoutException("slow"))
        with pytest.raises(MultiPublishTimeoutError):
            await HttpClient(retry_policy=RetryPolicy(max_retries=1)).async_get("https://example.com/async-timeout")

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_connection_error(self):
        rm = respx
        rm.get("https://example.com/async-conn").mock(side_effect=httpx.ConnectError("refused"))
        with pytest.raises(MultiPublishConnectionError):
            await HttpClient(retry_policy=RetryPolicy(max_retries=1)).async_get("https://example.com/async-conn")

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_http_error(self):
        rm = respx
        rm.get("https://example.com/async-http").respond(500, text="server error")
        with pytest.raises(MultiPublishHTTPError):
            await HttpClient(retry_policy=RetryPolicy(max_retries=1)).async_get("https://example.com/async-http")

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_proxy_error(self):
        rm = respx
        rm.get("https://example.com/async-proxy").mock(side_effect=httpx.ProxyError("bad proxy"))
        with pytest.raises(MultiPublishProxyError):
            await HttpClient(retry_policy=RetryPolicy(max_retries=1)).async_get("https://example.com/async-proxy")
