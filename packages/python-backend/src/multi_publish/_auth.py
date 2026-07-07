"""Auth middleware ? httpx.Auth subclass + convenience middleware.

? TikHub SDK _auth.py ?????:
- BearerAuth: httpx.Auth ??????? Authorization ?
- AuthMiddleware: ???????????? httpx ??
"""

from __future__ import annotations

import httpx

__all__ = ["BearerAuth", "AuthMiddleware"]


class BearerAuth(httpx.Auth):
    """httpx Bearer token auth flow.

    ?? httpx.Auth ????????????? Authorization ??
    ?? sync ? async client.

    Usage:
        client = httpx.Client(auth=BearerAuth("my-token"))
        client.get("https://api.example.com")  # ??? Authorization ?
    """

    def __init__(self, token: str, scheme: str = "Bearer"):
        if not token or not token.strip():
            raise ValueError("Auth token must be non-empty")
        self._token = token
        self._scheme = scheme

    def auth_flow(self, request: httpx.Request) -> httpx.Request:
        request.headers["Authorization"] = f"{self._scheme} {self._token}"
        yield request


class AuthMiddleware:
    """??????????????? httpx.Auth ???

    ?? API token ??? scheme??????/???
    """

    def __init__(self, token: str | None = None, scheme: str = "Bearer"):
        self.token = token
        self.scheme = scheme

    def get_header(self) -> dict[str, str]:
        if self.token:
            return {"Authorization": f"{self.scheme} {self.token}"}
        return {}

    def set_token(self, token: str, scheme: str = "Bearer"):
        if not token:
            raise ValueError("Auth token must be non-empty")
        self.token = token
        self.scheme = scheme

    def clear(self):
        self.token = None
