"""Cost tracker for video creation module.

Adapted from OpenMontage tools/cost_tracker.py.
Tracks estimated, reserved, and actual costs for API-based tools.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from multi_publish.video_creation.config_model import BudgetMode


class EntryStatus(str, Enum):
    ESTIMATED = "estimated"
    RESERVED = "reserved"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class BudgetExceededError(Exception):
    pass


class ApprovalRequiredError(Exception):
    pass


class CostTracker:
    def __init__(
        self,
        budget_total_usd: float = 10.0,
        reserve_pct: float = 0.10,
        single_action_approval_usd: float = 50.0,
        mode: BudgetMode = BudgetMode.WARN,
        cost_log_path: Path | None = None,
    ) -> None:
        self.budget_total_usd = budget_total_usd
        self.reserve_pct = reserve_pct
        self.single_action_approval_usd = single_action_approval_usd
        self.mode = mode
        self.cost_log_path = cost_log_path
        self.entries: list[dict[str, Any]] = []
        if cost_log_path and cost_log_path.exists():
            self._load()

    @property
    def budget_reserved_usd(self) -> float:
        return sum(e.get("reserved_usd", 0.0) for e in self.entries if e["status"] == EntryStatus.RESERVED.value)

    @property
    def budget_spent_usd(self) -> float:
        return sum(e.get("actual_usd", 0.0) for e in self.entries if e["status"] in (EntryStatus.COMPLETED.value, EntryStatus.FAILED.value))

    @property
    def budget_remaining_usd(self) -> float:
        return self.budget_total_usd - self.budget_spent_usd - self.budget_reserved_usd

    @property
    def usable_budget_usd(self) -> float:
        holdback = self.budget_total_usd * self.reserve_pct
        return max(0.0, self.budget_remaining_usd - holdback)

    def cost_snapshot(self) -> dict[str, float]:
        return {
            "total_spent_usd": round(self.budget_spent_usd, 4),
            "total_reserved_usd": round(self.budget_reserved_usd, 4),
            "budget_remaining_usd": round(self.budget_remaining_usd, 4),
        }

    def estimate(self, tool: str, operation: str, estimated_usd: float) -> str:
        entry_id = uuid.uuid4().hex[:12]
        self.entries.append({
            "id": entry_id,
            "tool": tool,
            "operation": operation,
            "status": EntryStatus.ESTIMATED.value,
            "estimated_usd": round(estimated_usd, 4),
            "reserved_usd": 0.0,
            "actual_usd": 0.0,
            "timestamp": datetime.now(UTC).isoformat(),
        })
        self._save()
        return entry_id

    def reserve(self, entry_id: str) -> None:
        entry = self._find(entry_id)
        estimated = entry["estimated_usd"]
        if estimated > self.single_action_approval_usd:
            if self.mode != BudgetMode.OBSERVE:
                raise ApprovalRequiredError(f"Action costs ${estimated:.2f}, exceeds threshold ${self.single_action_approval_usd:.2f}")
        if estimated > self.usable_budget_usd:
            if self.mode == BudgetMode.CAP:
                raise BudgetExceededError(f"Action costs ${estimated:.2f}, only ${self.usable_budget_usd:.2f} usable")
        entry["status"] = EntryStatus.RESERVED.value
        entry["reserved_usd"] = estimated
        self._save()

    def complete(self, entry_id: str, actual_usd: float) -> None:
        entry = self._find(entry_id)
        entry["status"] = EntryStatus.COMPLETED.value
        entry["actual_usd"] = round(actual_usd, 4)
        self._save()

    def fail(self, entry_id: str, actual_usd: float = 0.0) -> None:
        entry = self._find(entry_id)
        entry["status"] = EntryStatus.FAILED.value
        entry["actual_usd"] = round(actual_usd, 4)
        self._save()

    def _find(self, entry_id: str) -> dict[str, Any]:
        for entry in self.entries:
            if entry["id"] == entry_id:
                return entry
        raise KeyError(f"Cost entry {entry_id!r} not found")

    def _save(self) -> None:
        if self.cost_log_path is None:
            return
        data = {
            "version": "1.0",
            "budget_total_usd": self.budget_total_usd,
            "entries": self.entries,
        }
        self.cost_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.cost_log_path, "w") as f:
            json.dump(data, f, indent=2)

    def _load(self) -> None:
        with open(self.cost_log_path) as f:
            data = json.load(f)
        self.entries = data.get("entries", [])
        self.budget_total_usd = data.get("budget_total_usd", self.budget_total_usd)
