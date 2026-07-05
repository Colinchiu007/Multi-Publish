
from __future__ import annotations
from collections.abc import Mapping
from typing import Any

__all__ = [
    "MultiPublishError", "MultiPublishConfigError",
    "MultiPublishConnectionError", "MultiPublishTimeoutError",
    "MultiPublishProxyError", "MultiPublishHTTPError",
    "MultiPublishAuthError", "MultiPublishPermissionError",
    "MultiPublishNotFoundError", "MultiPublishBadRequestError",
    "MultiPublishValidationError", "MultiPublishRateLimitError",
    "MultiPublishServerError", "MultiPublishUpstreamError",
    "MultiPublishPlatformError",
]

_REDACT = "***"

def _redact_headers(headers):
    if not headers:
        return {}
    return {k: (_REDACT if k.lower() == "authorization" else v) for k, v in headers.items()}

class MultiPublishError(Exception):
    pass

class MultiPublishConfigError(MultiPublishError):
    pass

class MultiPublishConnectionError(MultiPublishError):
    def __init__(self, message, *, cause=None):
        super().__init__(message)
        self.__cause__ = cause

class MultiPublishTimeoutError(MultiPublishConnectionError):
    pass

class MultiPublishProxyError(MultiPublishConnectionError):
    pass

class MultiPublishHTTPError(MultiPublishError):
    def __init__(self, message, *, status_code, method, url, params=None, request_body=None, response_body=None, request_id=None, headers=None):
        super().__init__(message)
        self.status_code = status_code
        self.method = method
        self.url = url
        self.params = dict(params) if params else {}
        self.request_body = request_body
        self.response_body = response_body
        self.request_id = request_id
        self._headers = _redact_headers(headers)
    def __str__(self):
        parts = [f"{self.status_code} {self.method} {self.url}"]
        if self.request_id:
            parts.append(f"request_id={self.request_id}")
        if self.response_body:
            parts.append(f"body={str(self.response_body)[:500]}")
        return " | ".join(parts)

class MultiPublishAuthError(MultiPublishHTTPError):
    pass

class MultiPublishPermissionError(MultiPublishHTTPError):
    pass

class MultiPublishNotFoundError(MultiPublishHTTPError):
    pass

class MultiPublishBadRequestError(MultiPublishHTTPError):
    pass

class MultiPublishValidationError(MultiPublishHTTPError):
    pass

class MultiPublishRateLimitError(MultiPublishHTTPError):
    def __init__(self, message, *, retry_after=None, **kwargs):
        super().__init__(message, **kwargs)
        self.retry_after = retry_after

class MultiPublishServerError(MultiPublishHTTPError):
    pass

class MultiPublishUpstreamError(MultiPublishHTTPError):
    pass

class MultiPublishPlatformError(MultiPublishError):
    def __init__(self, message, *, platform, platform_code=None, retry_after=None, cause=None):
        super().__init__(message)
        self.platform = platform
        self.platform_code = platform_code
        self.retry_after = retry_after
        self.__cause__ = cause

def http_error_for_status(response_body, *, status_code, method, url, params=None, request_body=None, request_id=None, headers=None):
    kwargs = dict(
        message=str(response_body or f"HTTP {status_code}"),
        status_code=status_code, method=method, url=url,
        params=params, request_body=request_body,
        response_body=response_body, request_id=request_id, headers=headers,
    )
    if status_code == 400:
        return MultiPublishBadRequestError(**kwargs)
    elif status_code == 401:
        return MultiPublishAuthError(**kwargs)
    elif status_code == 403:
        return MultiPublishPermissionError(**kwargs)
    elif status_code == 404:
        return MultiPublishNotFoundError(**kwargs)
    elif status_code == 422:
        return MultiPublishValidationError(**kwargs)
    elif status_code == 429:
        ra = None
        if isinstance(response_body, dict):
            ra = response_body.get("retry_after") or response_body.get("retry-after")
            if ra is not None:
                try:
                    ra = float(ra)
                except (TypeError, ValueError):
                    ra = None
        return MultiPublishRateLimitError(retry_after=ra, **kwargs)
    elif 500 <= status_code < 600:
        if status_code in (502, 503):
            return MultiPublishUpstreamError(**kwargs)
        return MultiPublishServerError(**kwargs)
    else:
        return MultiPublishHTTPError(**kwargs)
