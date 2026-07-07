"""
WeChat Publisher Exceptions

Custom exceptions for WeChat Official Account publisher module.
"""

from typing import Any


class WeChatError(Exception):
    """Base exception for all WeChat publisher errors."""

    def __init__(
        self,
        message: str,
        error_code: int | None = None,
        error_info: dict[str, Any] | None = None
    ):
        self.message = message
        self.error_code = error_code
        self.error_info = error_info or {}
        super().__init__(self.message)

    def __str__(self) -> str:
        if self.error_code:
            return f"[Error {self.error_code}] {self.message}"
        return self.message


class WeChatAuthError(WeChatError):
    """Raised when authentication fails (invalid credentials, token expired)."""

    pass


class WeChatAPIError(WeChatError):
    """Raised when WeChat API returns an error response."""

    pass


class WeChatUploadError(WeChatError):
    """Raised when media upload fails (image, video, etc.)."""

    pass


class WeChatPublishError(WeChatError):
    """Raised when article publishing fails."""

    pass


class WeChatDraftError(WeChatError):
    """Raised when draft creation or management fails."""

    pass


class WeChatConfigError(WeChatError):
    """Raised when configuration is invalid or missing."""

    pass


class WeChatRateLimitError(WeChatError):
    """Raised when API rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: int | None = None,
        **kwargs: Any
    ):
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class WeChatNetworkError(WeChatError):
    """Raised when network requests fail."""

    pass


def raise_for_error_code(error_code: int, error_message: str) -> None:
    """
    Raise appropriate exception based on WeChat error code.

    Args:
        error_code: WeChat API error code
        error_message: Error message from API

    Raises:
        WeChatAuthError: For authentication errors (40001, 40002, 40125, etc.)
        WeChatAPIError: For general API errors
        WeChatRateLimitError: For rate limiting (45009)
    """
    # Authentication errors
    auth_error_codes = {
        40001: "Invalid access_token",
        40002: "Invalid credential",
        40013: "Invalid appid",
        40125: "Invalid appsecret",
        42001: "Access token expired",
        42002: "Refresh token expired",
        42003: "Access token invalid",
    }

    # Rate limiting
    if error_code == 45009:
        raise WeChatRateLimitError(
            f"Rate limit exceeded: {error_message}",
            error_code=error_code,
            error_info={"error": error_message}
        )

    # Authentication errors
    if error_code in auth_error_codes:
        raise WeChatAuthError(
            f"{auth_error_codes.get(error_code, 'Authentication failed')}: {error_message}",
            error_code=error_code,
            error_info={"error": error_message}
        )

    # Generic API error
    raise WeChatAPIError(
        f"WeChat API error: {error_message}",
        error_code=error_code,
        error_info={"error": error_message}
    )
