"""Tests for PreCheck engine."""

import pytest

from multi_publish.precheck import CheckResult, CheckSeverity, DuplicateCheck, PreCheckEngine


class TestCheckSeverity:
    def test_values(self):
        assert CheckSeverity.PASS.value == "pass"
        assert CheckSeverity.WARN.value == "warn"
        assert CheckSeverity.BLOCK.value == "block"


class TestCheckResult:
    def test_defaults(self):
        r = CheckResult(passed=True)
        assert r.passed is True
        assert r.severity == CheckSeverity.PASS

    def test_block_result(self):
        r = CheckResult(passed=False, severity=CheckSeverity.BLOCK, message="dup")
        assert r.passed is False
        assert r.severity == CheckSeverity.BLOCK


class TestDuplicateCheck:
    def test_minimal(self):
        dc = DuplicateCheck(title="t", platform="weibo")
        assert dc.threshold == 0.8

    def test_full(self):
        dc = DuplicateCheck(title="t", platform="p", content_hash="abc", threshold=0.9)
        assert dc.content_hash == "abc"


class TestPreCheckEngine:
    def test_init_requires_tikhub_bridge(self):
        with pytest.raises(TypeError, match="TikHubBridge"):
            PreCheckEngine("bad")

    def test_available_always_false(self):
        from multi_publish.tikhub_bridge import TikHubBridge

        engine = PreCheckEngine(TikHubBridge())
        assert engine.available is False

    def test_check_duplicate_always_pass(self):
        from multi_publish.tikhub_bridge import TikHubBridge

        engine = PreCheckEngine(TikHubBridge())
        dc = DuplicateCheck(title="x", platform="weibo")
        r = engine.check_duplicate(dc)
        assert r.passed is True and "禁用" in r.message
