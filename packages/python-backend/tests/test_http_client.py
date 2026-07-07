"""Tests for HttpClient."""

import pytest
import httpx
import respx
import dataclasses
from multi_publish._http_client import HttpClient
from multi_publish._retries import RetryPolicy
from multi_publish._errors import (
    MultiPublishHTTPError, MultiPublishTimeoutError,
    MultiPublishConnectionError, MultiPublishConfigError,
)


class TestHttpClientInit:
    def test_defaults(self):
        c = HttpClient()
        assert c.base_url == ""
        assert c.default_timeout == 30.0

    def test_auth_token(self):
        c = HttpClient()
        c.set_auth_token("tok123")
        assert c._get_auth_header()["Authorization"] == "Bearer tok123"

    def test_auth_token_empty_raises(self):
        c = HttpClient()
        with pytest.raises(MultiPublishConfigError):
            c.set_auth_token("")

    def test_clear_auth(self):
        c = HttpClient()
        c.set_auth_token("tok")
        c.clear_auth()
        assert c._get_auth_header() == {}


class TestHttpClientRequests:
    def test_get_success(self):
        with respx.mock as rm:
            rm.get("https://example.com/api").respond(200, json={"ok": True})
            r = HttpClient().get("https://example.com/api")
            assert r.status_code == 200

    def test_post_json(self):
        with respx.mock as rm:
            rm.post("https://example.com/api").respond(201, json={"id": 1})
            r = HttpClient().post("https://example.com/api", json={"name": "test"})
            assert r.status_code == 201

    def test_404_raises_http_error(self):
        with respx.mock as rm:
            rm.get("https://example.com/404").respond(404)
            with pytest.raises(MultiPublishHTTPError):
                HttpClient().get("https://example.com/404")

    def test_500_retries_then_raises(self):
        with respx.mock as rm:
            rm.get("https://example.com/500").respond(500)
            with pytest.raises(MultiPublishHTTPError):
                HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/500")

    def test_timeout_retries_then_raises(self):
        with respx.mock as rm:
            rm.get("https://example.com/timeout").mock(side_effect=httpx.TimeoutException("x"))
            with pytest.raises(MultiPublishTimeoutError):
                HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/timeout")

    def test_connection_error_retries(self):
        with respx.mock as rm:
            rm.get("https://example.com/conn").mock(side_effect=httpx.ConnectError("refused"))
            with pytest.raises(MultiPublishConnectionError):
                HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/conn")

    def test_flaky_500_recovered(self):
        with respx.mock as rm:
            rm.get("https://example.com/flaky").mock(
                side_effect=[httpx.Response(500), httpx.Response(200, json={"ok": True})]
            )
            r = HttpClient(retry_policy=RetryPolicy(max_retries=2)).get("https://example.com/flaky")
            assert r.status_code == 200

    def test_auth_header_sent(self):
        with respx.mock as rm:
            route = rm.get("https://example.com/me")
            c = HttpClient()
            c.set_auth_token("secret")
            c.get("https://example.com/me")
            assert route.calls.last.request.headers["Authorization"] == "Bearer secret"

