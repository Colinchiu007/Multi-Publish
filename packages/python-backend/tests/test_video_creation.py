"""Tests for video creation infrastructure (Phase 0)."""

import tempfile
from pathlib import Path

import pytest

from multi_publish.video_creation.base_tool import (
    BaseTool,
    ResourceProfile,
    ToolResult,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.config_model import BudgetConfig, BudgetMode, VideoCreationConfig
from multi_publish.video_creation.cost_tracker import (
    ApprovalRequiredError,
    BudgetExceededError,
    CostTracker,
)
from multi_publish.video_creation.tool_registry import ToolRegistry


class TestToolEnums:
    def test_tool_tier_values(self):
        assert ToolTier.CORE.value == "core"
        assert ToolTier.GENERATE.value == "generate"

    def test_tool_stability_values(self):
        assert ToolStability.PRODUCTION.value == "production"

    def test_tool_status_values(self):
        assert ToolStatus.AVAILABLE.value == "available"


class TestResourceProfile:
    def test_default(self):
        p = ResourceProfile()
        assert p.cpu_cores == 1
        assert not p.network_required

    def test_custom(self):
        p = ResourceProfile(cpu_cores=4, ram_mb=4096, vram_mb=8192, network_required=True)
        assert p.cpu_cores == 4


class TestToolResult:
    def test_default(self):
        r = ToolResult(success=True)
        assert r.success
        assert r.error is None

    def test_error(self):
        r = ToolResult(success=False, error="fail")
        assert not r.success
        assert r.error == "fail"


class TestBaseToolSubclass:
    def test_valid(self):
        class FT(BaseTool):
            name = "ft"
            capability = "v"
            provider = "t"
            tier = ToolTier.GENERATE

            def execute(self, i):
                return ToolResult(success=True)

        t = FT()
        assert t.name == "ft"
        assert t.get_info()["tier"] == "generate"

    def test_valid_without_name(self):
        class _(BaseTool):
            name = "x"
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

        assert _().name == "x"

    def test_dry_run(self):
        class FT(BaseTool):
            name = "d"
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

        r = FT().dry_run({})
        assert r["tool"] == "d"
        assert r["would_execute"]

    def test_idempotency(self):
        class IT(BaseTool):
            name = "i"
            capability = "t"
            provider = "t"
            idempotency_key_fields = ["prompt", "seed"]

            def execute(self, i):
                return ToolResult(success=True)

        t = IT()
        assert t.idempotency_key({"prompt": "a", "seed": 1}) == t.idempotency_key({"prompt": "a", "seed": 1})
        assert t.idempotency_key({"prompt": "a", "seed": 1}) != t.idempotency_key({"prompt": "b", "seed": 1})

    def test_estimate_cost(self):
        class PT(BaseTool):
            name = "p"
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

            def estimate_cost(self, i):
                return 0.05

        t = PT()
        assert t.estimate_cost({}) == 0.05


class TestToolRegistry:
    def test_register_get(self):
        class T(BaseTool):
            name = "x"
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

        r = ToolRegistry()
        t = T()
        r.register(t)
        assert r.get("x") is t
        assert r.get("none") is None

    def test_empty_name_raises(self):
        class T(BaseTool):
            name = ""
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

        with pytest.raises(ValueError):
            ToolRegistry().register(T())

    def test_list_by_tier(self):
        class G(BaseTool):
            name = "g"
            capability = "g"
            provider = "t"
            tier = ToolTier.GENERATE

            def execute(self, i):
                return ToolResult(success=True)

        class C(BaseTool):
            name = "c"
            capability = "c"
            provider = "t"
            tier = ToolTier.CORE

            def execute(self, i):
                return ToolResult(success=True)

        r = ToolRegistry()
        r.register(G())
        r.register(C())
        assert len(r.list_tools()) == 2
        assert len(r.list_tools(ToolTier.GENERATE)) == 1

    def test_clear(self):
        class T(BaseTool):
            name = "a"
            capability = "t"
            provider = "t"

            def execute(self, i):
                return ToolResult(success=True)

        r = ToolRegistry()
        r.register(T())
        r.clear()
        assert len(r.list_tools()) == 0

    def test_status_summary(self):
        class T(BaseTool):
            name = "t1"
            capability = "video"
            provider = "p1"
            tier = ToolTier.GENERATE

            def execute(self, i):
                return ToolResult(success=True)

        r = ToolRegistry()
        r.register(T())
        s = r.get_status_summary()
        assert s["total_tools"] == 1
        assert s["capabilities"][0]["capability"] == "video"


class TestCostTracker:
    def test_initial(self):
        ct = CostTracker(100.0)
        assert ct.budget_total_usd == 100.0
        assert ct.budget_remaining_usd == 100.0

    def test_estimate_complete(self):
        ct = CostTracker(100.0)
        eid = ct.estimate("hunyuan", "t2v", 2.50)
        ct.reserve(eid)
        ct.complete(eid, 2.30)
        assert ct.budget_spent_usd == 2.30

    def test_estimate_fail(self):
        ct = CostTracker(100.0)
        eid = ct.estimate("kling", "t2v", 5.0)
        ct.reserve(eid)
        ct.fail(eid, 0.50)
        assert ct.budget_spent_usd == 0.50

    def test_cap_mode_blocks(self):
        ct = CostTracker(1.0, mode=BudgetMode.CAP, single_action_approval_usd=100.0)
        eid = ct.estimate("x", "gen", 5.0)
        with pytest.raises(BudgetExceededError):
            ct.reserve(eid)

    def test_approval_threshold(self):
        ct = CostTracker(100.0, single_action_approval_usd=1.0)
        eid = ct.estimate("x", "gen", 5.0)
        with pytest.raises(ApprovalRequiredError):
            ct.reserve(eid)

    def test_observe_mode_skips(self):
        ct = CostTracker(1.0, mode=BudgetMode.OBSERVE, single_action_approval_usd=0.1)
        eid = ct.estimate("x", "gen", 5.0)
        ct.reserve(eid)
        assert ct.budget_reserved_usd == 5.0

    def test_usable_budget(self):
        ct = CostTracker(100.0, reserve_pct=0.10)
        eid = ct.estimate("t", "o", 10.0)
        ct.reserve(eid)
        assert ct.usable_budget_usd == 80.0

    def test_persistence(self):
        tf = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w")
        tf.write("{}")
        lp = Path(tf.name)
        tf.close()
        try:
            c1 = CostTracker(50.0, cost_log_path=lp)
            eid = c1.estimate("t", "o", 1.0)
            c1.reserve(eid)
            c1.complete(eid, 0.8)
            c2 = CostTracker(50.0, cost_log_path=lp)
            assert c2.budget_spent_usd == 0.8
        finally:
            lp.unlink(missing_ok=True)


class TestVideoCreationConfig:
    def test_default(self):
        c = VideoCreationConfig()
        assert c.budget.mode == BudgetMode.WARN
        assert c.output.default_format == "mp4"

    def test_custom(self):
        c = VideoCreationConfig(budget=BudgetConfig(mode=BudgetMode.CAP, total_usd=50.0))
        assert c.budget.mode == BudgetMode.CAP

    def test_resolve_path(self):
        assert isinstance(VideoCreationConfig().resolve_path("output_dir"), Path)
