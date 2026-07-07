"""Test rate_limit module edge cases."""
import time
import pytest
from multi_publish._rate_limit import (
    parse_retry_after,
    parse_rate_limit_remaining,
    parse_rate_limit_limit,
)


class TestParseRetryAfter:
    """Cover edge cases not tested in test_infrastructure."""

    def test_reset_timestamp(self):
        """Unix timestamp > 10^9: rv - time.time()"""
        future_ts = time.time() + 60  # 60 seconds from now
        headers = {"x-ratelimit-reset": str(future_ts)}
        result = parse_retry_after(headers)
        assert result is not None
        assert 55 <= result <= 65  # ~60 seconds

    def test_reset_seconds(self):
        """x-ratelimit-reset is seconds (<= 10^9)"""
        headers = {"x-ratelimit-reset": "30"}
        result = parse_retry_after(headers)
        assert result == 30.0

    def test_retry_after_as_seconds(self):
        """retry-after as float seconds"""
        headers = {"retry-after": "2.5"}
        result = parse_retry_after(headers)
        assert result == 2.5

    def test_retry_after_invalid_value(self):
        """retry-after with non-numeric value falls through"""
        headers = {"retry-after": "abc"}
        result = parse_retry_after(headers)
        # Should fall through to x-ratelimit-reset check
        assert result is None  # No reset header either

    def test_no_headers(self):
        """Empty headers returns None"""
        assert parse_retry_after({}) is None

    def test_case_insensitive_retry_after(self):
        """Retry-After with capital letters"""
        headers = {"Retry-After": "5"}
        assert parse_retry_after(headers) == 5.0


class TestParseRateLimitLimit:
    """Cover parse_rate_limit_limit edge cases."""

    def test_normal_value(self):
        headers = {"x-ratelimit-limit": "100"}
        assert parse_rate_limit_limit(headers) == 100

    def test_invalid_value(self):
        headers = {"x-ratelimit-limit": "not-a-number"}
        assert parse_rate_limit_limit(headers) is None

    def test_missing_header(self):
        assert parse_rate_limit_limit({}) is None

    def test_case_variants(self):
        headers = {"X-RateLimit-Limit": "50"}
        assert parse_rate_limit_limit(headers) == 50


class TestParseRateLimitRemaining:
    """Cover parse_rate_limit_remaining edge cases."""

    def test_case_variants(self):
        headers = {"X-RateLimit-Remaining": "42"}
        assert parse_rate_limit_remaining(headers) == 42
