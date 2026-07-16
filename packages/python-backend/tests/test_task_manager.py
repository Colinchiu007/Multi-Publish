# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Tests for TaskManager (migrated from Pixelle-Video, Apache 2.0).

Covers:
1. State transitions: pending -> running -> completed (happy path)
2. State transitions: pending -> running -> failed (error path)
3. State transitions: pending/running -> cancelled (cancel path)
4. cancel_previous: creating new task of same type cancels old one
5. max_concurrent: excess tasks stay pending
6. get_task_status returns correct status/progress
7. cleanup_completed removes old tasks
8. start/stop lifecycle
9. Invalid state transition raises error (e.g., completed -> running)
"""

import asyncio
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from multi_publish.core.task_manager import (
    InvalidStateTransitionError,
    Task,
    TaskManager,
    TaskProgress,
    TaskStatus,
)


# ---------------------------------------------------------------------------
# Helper coroutines
# ---------------------------------------------------------------------------

async def quick_success():
    """Completes immediately."""
    return "done"


async def quick_failure():
    """Raises immediately."""
    raise ValueError("boom")


async def slow_success(delay=5.0):
    """Completes after delay."""
    await asyncio.sleep(delay)
    return "done"


async def slow_failure(delay=5.0):
    """Raises after delay."""
    await asyncio.sleep(delay)
    raise RuntimeError("delayed boom")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def manager():
    """Fresh TaskManager with max_concurrent=3. Cleans up after each test."""
    m = TaskManager(max_concurrent=3)
    yield m
    # Ensure all running/pending tasks are cancelled and their coroutines
    # properly closed to avoid "coroutine was never awaited" warnings.
    await m.stop()


# ---------------------------------------------------------------------------
# 1. State transitions: happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestStateMachineHappy:
    async def test_pending_to_running_to_completed(self, manager):
        """Happy path: pending -> running -> completed."""
        task = await manager.create_task("video_gen", quick_success())
        # Immediately after creation the task is scheduled -> RUNNING
        assert task.status == TaskStatus.RUNNING
        # Allow the coroutine to complete
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED
        assert task.result == "done"
        assert task.error is None
        assert task.started_at is not None
        assert task.completed_at is not None

    async def test_completed_task_has_result(self, manager):
        """Completed task stores the coroutine return value."""
        task = await manager.create_task("type_a", quick_success())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED
        assert task.result == "done"


# ---------------------------------------------------------------------------
# 2. State transitions: error path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestStateMachineFailure:
    async def test_pending_to_running_to_failed(self, manager):
        """Error path: pending -> running -> failed."""
        task = await manager.create_task("video_gen", quick_failure())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.FAILED
        assert task.error == "boom"
        assert task.result is None
        assert task.completed_at is not None

    async def test_slow_failure(self, manager):
        """Failure after delay."""
        task = await manager.create_task("video_gen", slow_failure(0.3))
        await asyncio.sleep(0.1)
        assert task.status == TaskStatus.RUNNING
        await asyncio.sleep(0.4)
        assert task.status == TaskStatus.FAILED
        assert "delayed boom" in task.error


# ---------------------------------------------------------------------------
# 3. State transitions: cancel path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestStateMachineCancel:
    async def test_cancel_running_task(self, manager):
        """Cancel a running task: running -> cancelled."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        await asyncio.sleep(0.1)
        assert task.status == TaskStatus.RUNNING

        result = await manager.cancel_task(task.id)
        assert result is True
        # Allow cancellation to propagate
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.CANCELLED
        assert task.completed_at is not None

    async def test_cancel_pending_task(self, manager):
        """Cancel a pending task: pending -> cancelled."""
        # Fill all running slots (max_concurrent=3)
        await manager.create_task("type_x", slow_success(5.0))
        await manager.create_task("type_x", slow_success(5.0))
        await manager.create_task("type_x", slow_success(5.0))
        # This one should be pending
        pending_task = await manager.create_task("type_x", slow_success(5.0))
        assert pending_task.status == TaskStatus.PENDING

        result = await manager.cancel_task(pending_task.id)
        assert result is True
        assert pending_task.status == TaskStatus.CANCELLED


# ---------------------------------------------------------------------------
# 4. cancel_previous: mutual exclusion
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCancelPrevious:
    async def test_cancel_previous_same_type_running(self, manager):
        """New task of same type cancels old running task."""
        old_task = await manager.create_task("video_gen", slow_success(5.0))
        await asyncio.sleep(0.1)
        assert old_task.status == TaskStatus.RUNNING

        new_task = await manager.create_task(
            "video_gen", quick_success(), cancel_previous=True
        )
        await asyncio.sleep(0.3)

        assert old_task.status == TaskStatus.CANCELLED
        assert new_task.status == TaskStatus.COMPLETED

    async def test_cancel_previous_different_type_unaffected(self, manager):
        """cancel_previous does not affect different task types."""
        task_a = await manager.create_task("type_a", slow_success(5.0))
        await asyncio.sleep(0.1)
        task_b = await manager.create_task(
            "type_b", quick_success(), cancel_previous=True
        )
        await asyncio.sleep(0.3)

        assert task_a.status == TaskStatus.RUNNING
        assert task_b.status == TaskStatus.COMPLETED

    async def test_cancel_previous_pending_same_type(self, manager):
        """cancel_previous also cancels pending tasks of the same type."""
        # Fill all 3 slots
        await manager.create_task("type_x", slow_success(5.0))
        await manager.create_task("type_x", slow_success(5.0))
        await manager.create_task("type_x", slow_success(5.0))
        # This one stays pending
        pending = await manager.create_task("type_x", slow_success(5.0))
        assert pending.status == TaskStatus.PENDING

        new_task = await manager.create_task(
            "type_x", quick_success(), cancel_previous=True
        )
        await asyncio.sleep(0.3)

        assert pending.status == TaskStatus.CANCELLED
        assert new_task.status == TaskStatus.COMPLETED

    async def test_cancel_previous_false_does_not_cancel(self, manager):
        """cancel_previous=False (default) does not cancel old tasks."""
        old_task = await manager.create_task("video_gen", slow_success(5.0))
        await asyncio.sleep(0.1)
        new_task = await manager.create_task(
            "video_gen", quick_success(), cancel_previous=False
        )
        await asyncio.sleep(0.3)

        assert old_task.status == TaskStatus.RUNNING
        assert new_task.status == TaskStatus.COMPLETED


# ---------------------------------------------------------------------------
# 5. max_concurrent: concurrency limit
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestMaxConcurrent:
    async def test_excess_tasks_stay_pending(self):
        """Tasks beyond max_concurrent stay pending."""
        mgr = TaskManager(max_concurrent=2)
        t1 = await mgr.create_task("type_a", slow_success(5.0))
        t2 = await mgr.create_task("type_a", slow_success(5.0))
        t3 = await mgr.create_task("type_a", slow_success(5.0))

        assert t1.status == TaskStatus.RUNNING
        assert t2.status == TaskStatus.RUNNING
        assert t3.status == TaskStatus.PENDING

        await mgr.stop()

    async def test_pending_starts_when_slot_frees(self):
        """Pending task starts when a running task completes."""
        mgr = TaskManager(max_concurrent=1)
        t1 = await mgr.create_task("type_a", quick_success())
        t2 = await mgr.create_task("type_a", slow_success(5.0))

        assert t1.status == TaskStatus.RUNNING
        assert t2.status == TaskStatus.PENDING

        # t1 should complete quickly, then t2 should start
        await asyncio.sleep(0.3)

        assert t1.status == TaskStatus.COMPLETED
        assert t2.status == TaskStatus.RUNNING

        await mgr.stop()

    async def test_max_concurrent_default(self):
        """Default max_concurrent is 3."""
        mgr = TaskManager()
        assert mgr.max_concurrent == 3


# ---------------------------------------------------------------------------
# 6. get_task_status: query API
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestGetTaskStatus:
    async def test_returns_correct_dict(self, manager):
        """get_task_status returns dict with expected fields."""
        task = await manager.create_task(
            "video_gen", quick_success(),
            metadata={"text": "hello"},
        )
        status = await manager.get_task_status(task.id)
        assert status is not None
        assert status["task_id"] == task.id
        assert status["task_type"] == "video_gen"
        assert status["status"] in ("running", "completed")
        assert status["metadata"] == {"text": "hello"}
        assert "created_at" in status

    async def test_returns_none_for_missing(self, manager):
        """get_task_status returns None for non-existent task."""
        status = await manager.get_task_status("nonexistent-id")
        assert status is None

    async def test_returns_progress(self, manager):
        """get_task_status includes progress when set."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        manager.update_progress(task.id, 50, 100, "halfway")
        status = await manager.get_task_status(task.id)
        assert status["progress"] is not None
        assert status["progress"]["current"] == 50
        assert status["progress"]["total"] == 100
        assert status["progress"]["percentage"] == 50.0
        assert status["progress"]["message"] == "halfway"

    async def test_progress_none_by_default(self, manager):
        """Progress is None when never updated."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        status = await manager.get_task_status(task.id)
        assert status["progress"] is None

    async def test_status_after_completion(self, manager):
        """Status reflects completed state with result."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        status = await manager.get_task_status(task.id)
        assert status["status"] == "completed"
        assert status["result"] == "done"
        assert status["error"] is None

    async def test_status_after_failure(self, manager):
        """Status reflects failed state with error."""
        task = await manager.create_task("video_gen", quick_failure())
        await asyncio.sleep(0.2)
        status = await manager.get_task_status(task.id)
        assert status["status"] == "failed"
        assert status["error"] == "boom"
        assert status["result"] is None


# ---------------------------------------------------------------------------
# 7. cleanup_completed: cleanup old tasks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCleanupCompleted:
    async def test_cleanup_removes_old_completed(self, manager):
        """cleanup_completed removes old completed tasks."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED

        # Simulate old completion time
        task.completed_at = datetime.now() - timedelta(hours=25)

        removed = await manager.cleanup_completed(max_age_hours=24)
        assert removed == 1
        assert manager.get_task(task.id) is None

    async def test_cleanup_keeps_recent(self, manager):
        """cleanup_completed keeps recent tasks."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        task.completed_at = datetime.now() - timedelta(hours=1)

        removed = await manager.cleanup_completed(max_age_hours=24)
        assert removed == 0
        assert manager.get_task(task.id) is not None

    async def test_cleanup_keeps_running(self, manager):
        """cleanup_completed does not remove running tasks."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        removed = await manager.cleanup_completed(max_age_hours=0)
        assert removed == 0
        assert manager.get_task(task.id) is not None

    async def test_cleanup_removes_failed_and_cancelled(self, manager):
        """cleanup_completed also removes old failed and cancelled tasks."""
        t_fail = await manager.create_task("type_a", quick_failure())
        await asyncio.sleep(0.2)
        t_cancel = await manager.create_task("type_b", slow_success(5.0))
        await manager.cancel_task(t_cancel.id)
        await asyncio.sleep(0.2)

        # Make them old
        t_fail.completed_at = datetime.now() - timedelta(hours=48)
        t_cancel.completed_at = datetime.now() - timedelta(hours=48)

        removed = await manager.cleanup_completed(max_age_hours=24)
        assert removed == 2
        assert manager.get_task(t_fail.id) is None
        assert manager.get_task(t_cancel.id) is None

    async def test_cleanup_empty_manager(self, manager):
        """cleanup_completed on empty manager returns 0."""
        removed = await manager.cleanup_completed(max_age_hours=24)
        assert removed == 0


# ---------------------------------------------------------------------------
# 8. start/stop lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestLifecycle:
    async def test_start_sets_running(self):
        mgr = TaskManager(max_concurrent=3)
        assert mgr._running is False
        await mgr.start()
        assert mgr._running is True
        await mgr.stop()

    async def test_start_idempotent(self):
        mgr = TaskManager(max_concurrent=3)
        await mgr.start()
        # Second start should not raise
        await mgr.start()
        assert mgr._running is True
        await mgr.stop()

    async def test_stop_cancels_running_tasks(self):
        mgr = TaskManager(max_concurrent=3)
        await mgr.start()
        task = await mgr.create_task("video_gen", slow_success(10.0))
        await asyncio.sleep(0.1)
        assert task.status == TaskStatus.RUNNING

        await mgr.stop()
        assert mgr._running is False
        assert task.status == TaskStatus.CANCELLED

    async def test_stop_idempotent(self):
        mgr = TaskManager(max_concurrent=3)
        await mgr.start()
        await mgr.stop()
        # Second stop should not raise
        await mgr.stop()
        assert mgr._running is False

    async def test_stop_without_start(self):
        """stop() works even if start() was never called."""
        mgr = TaskManager(max_concurrent=3)
        task = await mgr.create_task("video_gen", slow_success(5.0))
        await asyncio.sleep(0.1)
        await mgr.stop()
        assert mgr._running is False
        assert task.status == TaskStatus.CANCELLED

    async def test_stop_clears_all_tasks(self):
        """stop() clears the internal task storage."""
        mgr = TaskManager(max_concurrent=3)
        await mgr.start()
        await mgr.create_task("type_a", slow_success(5.0))
        await mgr.create_task("type_b", slow_success(5.0))
        await mgr.stop()
        assert len(mgr._tasks) == 0
        assert len(mgr._task_futures) == 0


# ---------------------------------------------------------------------------
# 9. Invalid state transition
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestInvalidStateTransition:
    async def test_completed_to_running_raises(self, manager):
        """Invalid: completed -> running raises error."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED

        with pytest.raises(InvalidStateTransitionError):
            manager._transition(task, TaskStatus.RUNNING)

    async def test_cancelled_to_running_raises(self, manager):
        """Invalid: cancelled -> running raises error."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        await manager.cancel_task(task.id)
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.CANCELLED

        with pytest.raises(InvalidStateTransitionError):
            manager._transition(task, TaskStatus.RUNNING)

    async def test_failed_to_running_raises(self, manager):
        """Invalid: failed -> running raises error."""
        task = await manager.create_task("video_gen", quick_failure())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.FAILED

        with pytest.raises(InvalidStateTransitionError):
            manager._transition(task, TaskStatus.RUNNING)

    async def test_completed_to_cancelled_raises(self, manager):
        """Invalid: completed -> cancelled raises error."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED

        with pytest.raises(InvalidStateTransitionError):
            manager._transition(task, TaskStatus.CANCELLED)


# ---------------------------------------------------------------------------
# Cancel edge cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCancelEdgeCases:
    async def test_cancel_nonexistent(self, manager):
        """Cancelling a non-existent task returns False."""
        result = await manager.cancel_task("nonexistent")
        assert result is False

    async def test_cancel_completed(self, manager):
        """Cancelling a completed task returns False."""
        task = await manager.create_task("video_gen", quick_success())
        await asyncio.sleep(0.2)
        assert task.status == TaskStatus.COMPLETED
        result = await manager.cancel_task(task.id)
        assert result is False

    async def test_cancel_already_cancelled(self, manager):
        """Cancelling an already cancelled task returns False."""
        task = await manager.create_task("video_gen", slow_success(5.0))
        result1 = await manager.cancel_task(task.id)
        assert result1 is True
        await asyncio.sleep(0.2)
        result2 = await manager.cancel_task(task.id)
        assert result2 is False


# ---------------------------------------------------------------------------
# Task model & progress
# ---------------------------------------------------------------------------

class TestTaskModel:
    def test_task_defaults(self):
        """Task has correct defaults."""
        task = Task(id="test-1", task_type="video_gen")
        assert task.status == TaskStatus.PENDING
        assert task.progress is None
        assert task.result is None
        assert task.error is None
        assert task.metadata is None
        assert task.created_at is not None
        assert task.started_at is None
        assert task.completed_at is None

    def test_task_progress_defaults(self):
        """TaskProgress has correct defaults."""
        p = TaskProgress()
        assert p.current == 0
        assert p.total == 0
        assert p.percentage == 0.0
        assert p.message == ""


class TestUpdateProgress:
    def test_update_progress_sets_percentage(self, manager):
        """update_progress calculates percentage correctly."""
        task = Task(id="test-1", task_type="video_gen")
        manager._tasks["test-1"] = task

        manager.update_progress("test-1", 25, 100, "quarterway")
        assert task.progress is not None
        assert task.progress.current == 25
        assert task.progress.total == 100
        assert task.progress.percentage == 25.0
        assert task.progress.message == "quarterway"

    def test_update_progress_zero_total(self, manager):
        """update_progress handles zero total gracefully."""
        task = Task(id="test-2", task_type="video_gen")
        manager._tasks["test-2"] = task

        manager.update_progress("test-2", 0, 0)
        assert task.progress.percentage == 0.0

    def test_update_progress_missing_task(self, manager):
        """update_progress on missing task is a no-op."""
        # Should not raise
        manager.update_progress("nonexistent", 1, 10)


# ---------------------------------------------------------------------------
# list_tasks
# ---------------------------------------------------------------------------

class TestListTasks:
    def test_list_empty(self, manager):
        """list_tasks on empty manager returns empty list."""
        assert manager.list_tasks() == []

    def test_list_with_filter(self, manager):
        """list_tasks filters by status."""
        t1 = Task(id="t1", task_type="a", status=TaskStatus.PENDING)
        t2 = Task(id="t2", task_type="a", status=TaskStatus.RUNNING)
        t3 = Task(id="t3", task_type="a", status=TaskStatus.COMPLETED)
        manager._tasks["t1"] = t1
        manager._tasks["t2"] = t2
        manager._tasks["t3"] = t3

        running = manager.list_tasks(status=TaskStatus.RUNNING)
        assert len(running) == 1
        assert running[0].id == "t2"

        all_tasks = manager.list_tasks()
        assert len(all_tasks) == 3
