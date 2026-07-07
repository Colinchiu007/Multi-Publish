
from __future__ import annotations

import time


def parse_retry_after(headers):
    ra = headers.get("retry-after") or headers.get("Retry-After")
    if ra:
        try:
            return max(0.0, float(ra))
        except (TypeError, ValueError):
            pass
    reset = headers.get("x-ratelimit-reset") or headers.get("X-RateLimit-Reset")
    if reset:
        try:
            rv = float(reset)
        except (TypeError, ValueError):
            return None
        if rv > 10**9:
            return max(0.0, rv - time.time())
        return max(0.0, rv)
    return None

def parse_rate_limit_remaining(headers):
    val = headers.get("x-ratelimit-remaining") or headers.get("X-RateLimit-Remaining")
    if val is not None:
        try:
            return int(val)
        except (TypeError, ValueError):
            pass
    return None

def parse_rate_limit_limit(headers):
    val = headers.get("x-ratelimit-limit") or headers.get("X-RateLimit-Limit")
    if val is not None:
        try:
            return int(val)
        except (TypeError, ValueError):
            pass
    return None
