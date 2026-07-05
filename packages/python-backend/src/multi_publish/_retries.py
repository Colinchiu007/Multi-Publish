
from __future__ import annotations
import random
from dataclasses import dataclass, field
from multi_publish._errors import (
    MultiPublishConnectionError, MultiPublishRateLimitError,
    MultiPublishServerError, MultiPublishUpstreamError,
)

@dataclass(frozen=True)
class RetryPolicy:
    max_retries: int = 3
    backoff_base: float = 0.5
    backoff_max: float = 30.0
    jitter: float = 0.25

    def should_retry(self, exc, attempt):
        if attempt >= self.max_retries:
            return False
        return isinstance(exc, (MultiPublishConnectionError, MultiPublishServerError, MultiPublishUpstreamError, MultiPublishRateLimitError))

    def sleep_for(self, exc, attempt):
        if isinstance(exc, MultiPublishRateLimitError) and exc.retry_after is not None:
            return max(0.0, exc.retry_after)
        raw_delay = self.backoff_base * (2 ** (attempt - 1))
        delay = min(self.backoff_max, raw_delay)
        if self.jitter:
            delay *= 1.0 + random.uniform(-self.jitter, self.jitter)
        return delay

DEFAULT_RETRY = RetryPolicy()
AGGRESSIVE_RETRY = RetryPolicy(max_retries=5, backoff_base=0.3, backoff_max=60.0)
FAST_RETRY = RetryPolicy(max_retries=2, backoff_base=1.0, backoff_max=5.0, jitter=0.1)
