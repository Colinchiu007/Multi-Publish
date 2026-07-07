from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import httpx

from multi_publish._errors import (
    MultiPublishConfigError,
    MultiPublishConnectionError,
    MultiPublishHTTPError,
    MultiPublishProxyError,
    MultiPublishTimeoutError,
    http_error_for_status,
)
from multi_publish._retries import DEFAULT_RETRY, RetryPolicy

_HTTPX_TIMEOUT_EX = (
    httpx.TimeoutException,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
)
_HTTPX_PROXY_EX = (httpx.ProxyError,)
_HTTPX_CONN_EX = (httpx.ConnectError, httpx.RemoteProtocolError, httpx.LocalProtocolError)


@dataclass
class HttpClient:
    base_url: str = ""
    default_timeout: float = 30.0
    default_headers: dict = field(
        default_factory=lambda: {"User-Agent": "Multi-Publish/1.0", "Accept": "application/json"}
    )
    retry_policy: RetryPolicy = DEFAULT_RETRY

    def __post_init__(self):
        self._auth_token = None
        self._auth_scheme = "Bearer"
        self._sync_client = None
        self._async_client = None

    def set_auth_token(self, token, scheme="Bearer"):
        if not token:
            raise MultiPublishConfigError("Auth token must be non-empty")
        self._auth_token = token
        self._auth_scheme = scheme

    def clear_auth(self):
        self._auth_token = None

    def _get_auth_header(self):
        if self._auth_token:
            return {"Authorization": f"{self._auth_scheme} {self._auth_token}"}
        return {}

    def _ensure_sync(self):
        if self._sync_client is None:
            self._sync_client = httpx.Client(base_url=self.base_url, timeout=self.default_timeout)
        return self._sync_client

    def _ensure_async(self):
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(base_url=self.base_url, timeout=self.default_timeout)
        return self._async_client

    def close_sync(self):
        if self._sync_client:
            self._sync_client.close()
            self._sync_client = None

    async def close_async(self):
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None

    def request(self, method, url, *, params=None, json=None, data=None, headers=None, retry_policy=None, timeout=None):
        policy = retry_policy or self.retry_policy
        merged_headers = {**self.default_headers, **self._get_auth_header(), **(headers or {})}
        for attempt in range(1, policy.max_retries + 1):
            client = self._ensure_sync()
            start = time.time()
            try:
                response = client.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json,
                    content=data,
                    headers=merged_headers,
                    timeout=timeout or self.default_timeout,
                )
                if response.status_code >= 400:
                    self._raise_for_status(response, method=method, url=url, params=params, request_body=json or data)
                return response
            except (MultiPublishHTTPError, httpx.HTTPStatusError) as exc:
                if isinstance(exc, httpx.HTTPStatusError):
                    exc = self._map_httpx_error(exc, method=method, url=str(exc.request.url))
                if isinstance(exc, MultiPublishHTTPError):
                    if policy.should_retry(exc, attempt):
                        time.sleep(policy.sleep_for(exc, attempt))
                        continue
                raise
            except _HTTPX_TIMEOUT_EX as exc:
                wrapped = MultiPublishTimeoutError("Request timed out", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    time.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
            except _HTTPX_PROXY_EX as exc:
                wrapped = MultiPublishProxyError("Proxy error", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    time.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
            except _HTTPX_CONN_EX as exc:
                wrapped = MultiPublishConnectionError("Connection error", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    time.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
        raise MultiPublishConnectionError(f"Request failed after {policy.max_retries} retries")

    async def async_request(
        self, method, url, *, params=None, json=None, data=None, headers=None, retry_policy=None, timeout=None
    ):
        policy = retry_policy or self.retry_policy
        merged_headers = {**self.default_headers, **self._get_auth_header(), **(headers or {})}
        for attempt in range(1, policy.max_retries + 1):
            client = self._ensure_async()
            start = time.time()
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json,
                    content=data,
                    headers=merged_headers,
                    timeout=timeout or self.default_timeout,
                )
                if response.status_code >= 400:
                    self._raise_for_status(response, method=method, url=url, params=params, request_body=json or data)
                return response
            except (MultiPublishHTTPError, httpx.HTTPStatusError) as exc:
                if isinstance(exc, httpx.HTTPStatusError):
                    exc = self._map_httpx_error(exc, method=method, url=str(exc.request.url))
                if isinstance(exc, MultiPublishHTTPError):
                    if policy.should_retry(exc, attempt):
                        await asyncio.sleep(policy.sleep_for(exc, attempt))
                        continue
                raise
            except _HTTPX_TIMEOUT_EX as exc:
                wrapped = MultiPublishTimeoutError("Request timed out", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    await asyncio.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
            except _HTTPX_PROXY_EX as exc:
                wrapped = MultiPublishProxyError("Proxy error", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    await asyncio.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
            except _HTTPX_CONN_EX as exc:
                wrapped = MultiPublishConnectionError("Connection error", cause=exc)
                if policy.should_retry(wrapped, attempt):
                    await asyncio.sleep(policy.sleep_for(wrapped, attempt))
                    continue
                raise wrapped from exc
        raise MultiPublishConnectionError(f"Request failed after {policy.max_retries} retries")

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def put(self, url, **kw):
        return self.request("PUT", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)

    async def async_get(self, url, **kw):
        return await self.async_request("GET", url, **kw)

    async def async_post(self, url, **kw):
        return await self.async_request("POST", url, **kw)

    async def async_put(self, url, **kw):
        return await self.async_request("PUT", url, **kw)

    async def async_delete(self, url, **kw):
        return await self.async_request("DELETE", url, **kw)

    def _raise_for_status(self, response, *, method, url, params=None, request_body=None):
        try:
            body = response.json()
        except Exception:
            body = response.text
        rid = response.headers.get("x-request-id") or response.headers.get("X-Request-Id")
        raise http_error_for_status(
            body,
            status_code=response.status_code,
            method=method,
            url=url,
            params=params,
            request_body=request_body,
            request_id=rid,
            headers=dict(response.headers),
        )

    def _map_httpx_error(self, exc, *, method, url):
        try:
            body = exc.response.json()
        except Exception:
            body = exc.response.text
        rid = exc.response.headers.get("x-request-id") or exc.response.headers.get("X-Request-Id")
        return http_error_for_status(
            body,
            status_code=exc.response.status_code,
            method=method,
            url=url,
            request_id=rid,
            headers=dict(exc.response.headers),
        )
