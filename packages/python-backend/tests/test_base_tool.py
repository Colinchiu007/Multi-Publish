"""Tests for video_creation/base_tool ? enums, dataclasses, BaseTool basics."""
import pytest
from multi_publish.video_creation.base_tool import (
    ToolTier, ToolStability, ToolStatus, ToolRuntime,
    ExecutionMode, Determinism, ResumeSupport,
    ResourceProfile, RetryPolicy, ToolResult, BaseTool,
)


class TestToolTier:
    def test_values(self):
        assert ToolTier.CORE.value == "core"
        assert ToolTier.GENERATE.value == "generate"

class TestToolStability:
    def test_values(self):
        assert ToolStability.EXPERIMENTAL.value == "experimental"
        assert ToolStability.PRODUCTION.value == "production"

class TestToolStatus:
    def test_values(self):
        assert ToolStatus.AVAILABLE.value == "available"

class TestToolRuntime:
    def test_values(self):
        assert ToolRuntime.LOCAL.value == "local"

class TestExecutionMode:
    def test_values(self):
        assert ExecutionMode.SYNC.value == "sync"

class TestDeterminism:
    def test_values(self):
        assert Determinism.SEEDED.value == "seeded"

class TestResumeSupport:
    def test_values(self):
        assert ResumeSupport.NONE.value == "none"

class TestResourceProfile:
    def test_defaults(self):
        p = ResourceProfile()
        assert p.cpu_cores == 1

class TestRetryPolicy:
    def test_defaults(self):
        p = RetryPolicy()
        assert p.max_retries == 0

class TestToolResult:
    def test_success(self):
        r = ToolResult(success=True)
        assert r.success and r.cost_usd == 0.0
    def test_failure(self):
        r = ToolResult(success=False, error="fail")
        assert r.error == "fail"
    def test_with_data(self):
        r = ToolResult(success=True, data={"url": "x"}, cost_usd=0.05)
        assert r.data["url"] == "x"
    def test_with_artifacts(self):
        r = ToolResult(success=True, artifacts=["/tmp/f"])
        assert len(r.artifacts) == 1

class TestBaseTool:
    class ConcreteTool(BaseTool):
        name = "test_tool"
        capability = "video"
        provider = "test_provider"
        def execute(self, inputs):
            return ToolResult(success=True, data={"echo": inputs})

    def test_get_status(self):
        assert self.ConcreteTool().get_status() == ToolStatus.AVAILABLE

    def test_get_info(self):
        info = self.ConcreteTool().get_info()
        assert info["name"] == "test_tool"
        assert info["runtime"] == "local"

    def test_estimate_cost(self):
        assert self.ConcreteTool().estimate_cost({}) == 0.0

    def test_estimate_runtime(self):
        assert self.ConcreteTool().estimate_runtime({}) == 0.0

    def test_idempotency_key(self):
        k = self.ConcreteTool().idempotency_key({"url": "x"})
        assert len(k) == 16

    def test_idempotency_key_deterministic(self):
        t = self.ConcreteTool()
        assert t.idempotency_key({"a": 1, "b": 2}) == t.idempotency_key({"b": 2, "a": 1})

    def test_dry_run(self):
        dr = self.ConcreteTool().dry_run({"input": "test"})
        assert dr["tool"] == "test_tool"

    def test_execute(self):
        r = self.ConcreteTool().execute({"say": "hello"})
        assert r.success and r.data["echo"]["say"] == "hello"

    def test_get_status_override(self):
        class UT(BaseTool):
            name = "u"
            def get_status(self):
                return ToolStatus.UNAVAILABLE
            def execute(self, inputs):
                return ToolResult(success=False, error="u")
        assert UT().get_status() == ToolStatus.UNAVAILABLE
