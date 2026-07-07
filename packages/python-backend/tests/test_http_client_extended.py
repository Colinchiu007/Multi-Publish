"""Extended tests for HttpClient - error paths, helpers, cleanup."""
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


class TestHttpClientHelpers:
    """HTTP method helpers (put, delete, async variants)."""

    @respx.mock
    def test_put_success(self):
        rm = respx
        rm.put("https://example.com/api/1").respond(200, json={"updated": True})
        r = HttpClient().put("https://example.com/api/1", json={"name": "new"})
        assert r.status_code == 200

    @respx.mock
    def test_delete_success(self):
        rm = respx
        rm.delete("https://example.com/api/1").respond(204)
        r = HttpClient().delete("https://example.com/api/1")
        assert r.status_code == 204

    @respx.mock
    def test_put_raises_on_404(self):
        rm = respx
        rm.put("https://example.com/nope").respond(404)
        with pytest.raises(MultiPublishHTTPError):
            HttpClient().put("https://example.com/nope")

    @respx.mock
    def test_delete_raises_on_500(self):
        rm = respx
        rm.delete("https://example.com/nope").respond(500)
        with pytest.raises(MultiPublishHTTPError):
            HttpClient(retry_policy=RetryPolicy(max_retries=1)).delete("https://example.com/nope")

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_get_success(self):
        rm = respx
        rm.get("https://example.com/async").respond(200, json={"ok": True})
        r = await HttpClient().async_get("https://example.com/async")
        assert r.status_code == 200

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_post_success(self):
        rm = respx
        rm.post("https://example.com/async").respond(201, json={"id": 1})
        r = await HttpClient().async_post("https://example.com/async", json={"x": 1})
        assert r.status_code == 201

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_put_success(self):
        rm = respx
        rm.put("https://example.com/async/1").respond(200)
        r = await HttpClient().async_put("https://example.com/async/1")
        assert r.status_code == 200

    @pytest.mark.asyncio
    @respx.mock
    async def test_async_delete_success(self):
        rm = respx
        rm.delete("https://example.com/async/1").respond(204)
        r = await HttpClient().async_delete("https://example.com/async/1")
        assert r.status_code == 204


class TestHttpClientCleanup:
    """Client lifecycle management."""

    def test_close_sync(self):
        c = HttpClient()
        c._ensure_sync()
        assert c._sync_client is not None
        c.close_sync()
        assert c._sync_client is None

    @pytest.mark.asyncio
    async def test_close_async(self):
        c = HttpClient()
        c._ensure_async()
        assert c._async_client is not None
        await c.close_async()
        assert c._async_client is None

    def test_close_sync_idempotent(self):
        c = HttpClient()
        c.close_sync()  # should not raise
        assert c._sync_client is None


class TestHttpClientRetryExhaustion:
    """All retries fail scenarios."""

    @respx.mock
    def test_retry_exhaustion_connection_error(self):
        rm = respx
        rm.get("https://example.com/dead").mock(side_effect=httpx.ConnectError("refused"))
        with pytest.raises(MultiPublishConnectionError, match="Connection error"):
            HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/dead")


class TestHttpClientProxyErrors:
    """Proxy error scenarios."""

    @respx.mock
    def test_proxy_error_retries_then_raises(self):
        rm = respx
        rm.get("https://example.com/proxy").mock(side_effect=httpx.ProxyError("proxy failed"))
        with pytest.raises(MultiPublishProxyError):
            HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/proxy")


class TestHttpClientResponseParsing:
    """Response body parsing edge cases."""

    @respx.mock
    def test_404_with_json_body(self):
        rm = respx
        rm.get("https://example.com/json-err").respond(404, json={"error": "not found"})
        with pytest.raises(MultiPublishHTTPError) as exc:
            HttpClient().get("https://example.com/json-err")
        assert "not found" in str(exc.value)

    @respx.mock
    def test_500_with_text_body(self):
        rm = respx
        rm.get("https://example.com/text-err").respond(500, text="Internal Server Error")
        with pytest.raises(MultiPublishHTTPError):
            HttpClient(retry_policy=RetryPolicy(max_retries=1)).get("https://example.com/text-err")

