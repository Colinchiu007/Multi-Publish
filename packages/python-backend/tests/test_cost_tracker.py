"""Tests for CostTracker."""


import pytest

from multi_publish.video_creation.config_model import BudgetMode
from multi_publish.video_creation.cost_tracker import BudgetExceededError, CostTracker


class TestCostTracker:
    def test_init_defaults(self):
        ct = CostTracker()
        assert ct.budget_total_usd == 10.0
        assert ct.reserve_pct == 0.10
        assert ct.mode == BudgetMode.WARN
        assert ct.entries == []

    def test_budget_properties_empty(self):
        ct = CostTracker()
        assert ct.budget_spent_usd == 0.0
        assert ct.budget_reserved_usd == 0.0
        assert ct.budget_remaining_usd == 10.0
        assert ct.usable_budget_usd == 9.0

    def test_estimate_creates_entry(self):
        ct = CostTracker()
        eid = ct.estimate("test_tool", "generate", 1.5)
        assert len(eid) == 12
        assert len(ct.entries) == 1
        assert ct.entries[0]["tool"] == "test_tool"
        assert ct.entries[0]["estimated_usd"] == 1.5
        assert ct.entries[0]["status"] == "estimated"

    def test_reserve_after_estimate(self):
        ct = CostTracker()
        eid = ct.estimate("tool", "op", 2.0)
        ct.reserve(eid)
        assert ct.entries[0]["status"] == "reserved"
        assert ct.entries[0]["reserved_usd"] == 2.0

    def test_complete_flow(self):
        ct = CostTracker()
        eid = ct.estimate("tool", "op", 1.0)
        ct.reserve(eid)
        ct.complete(eid, actual_usd=0.8)
        assert ct.entries[0]["status"] == "completed"
        assert ct.budget_spent_usd == 0.8

    def test_fail_flow(self):
        ct = CostTracker()
        eid = ct.estimate("tool", "op", 1.0)
        ct.reserve(eid)
        ct.fail(eid)
        assert ct.entries[0]["status"] == "failed"
        assert ct.budget_spent_usd == 0.0

    def test_budget_exceeded_in_CAP_mode_during_reserve(self):  # noqa: N802
        ct = CostTracker(budget_total_usd=1.0, mode=BudgetMode.CAP)
        eid = ct.estimate("tool", "op", 0.6)
        ct.reserve(eid)
        ct.complete(eid, actual_usd=0.6)
        eid2 = ct.estimate("tool", "op", 0.5)
        with pytest.raises(BudgetExceededError):
            ct.reserve(eid2)

    def test_cost_snapshot(self):
        ct = CostTracker()
        eid = ct.estimate("tool", "op", 1.0)
        ct.reserve(eid)
        ct.complete(eid, actual_usd=0.5)
        snap = ct.cost_snapshot()
        assert snap["total_spent_usd"] == 0.5
        assert snap["budget_remaining_usd"] == pytest.approx(9.5, rel=1e-3)

    def test_persist_and_load(self, tmp_path):
        log = tmp_path / "cost_log.json"
        ct = CostTracker(cost_log_path=log)
        eid = ct.estimate("tool", "op", 2.0)
        ct.reserve(eid)
        ct.complete(eid, actual_usd=1.5)
        ct._save()
        ct2 = CostTracker(cost_log_path=log)
        assert len(ct2.entries) == 1
        assert ct2.entries[0]["tool"] == "tool"
        assert ct2.budget_spent_usd == 1.5
