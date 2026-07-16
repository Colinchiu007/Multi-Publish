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
"""
Async Task Manager with state machine, mutual exclusion, and concurrency limit.

Migrated from Pixelle-Video (Apache 2.0) and adapted for Multi-Publish.

This is a NEW parallel module — it does NOT replace the existing ``task_queue.py``.
It adds state machine enforcement, ``cancel_previous`` mutual exclusion, and
``max_concurrent`` concurrency limiting that the legacy queue lacks.

State machine::

    pending ──> running ──> completed
                      ├──> failed
                      └──> cancelled
    pending ──────────────> cancelled

Terminal states (completed / failed / cancelled) cannot transition further.
Any attempt to do so raises :class:`InvalidStateTransitionError`.
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Coroutine, Optional

from loguru import logger
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums & constants
# ---------------------------------------------------------------------------

class TaskStatus(str, Enum):
    """Task lifecycle state."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Allowed state transitions (from -> set of allowed targets).
_VALID_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.PENDING: {TaskStatus.RUNNING, TaskStatus.CANCELLED},
    TaskStatus.RUNNING: {
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.COMPLETED: set(),
    TaskStatus.FAILED: set(),
    TaskStatus.CANCELLED: set(),
}

# Terminal states — no further transitions allowed.
_TERMINAL_STATES: frozenset[TaskStatus] = frozenset(
    {TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED}
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class InvalidStateTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""


# ---------------------------------------------------------------------------
# Data models (Pydantic v2)
# ---------------------------------------------------------------------------

class TaskProgress(BaseModel):
    """Progress information for a running task."""

    current: int = 0
    total: int = 0
    percentage: float = 0.0
    message: str = ""


class Task(BaseModel):
    """
    In-memory task record.

    Fields are mutated in-place by :class:`TaskManager` as the task progresses
    through its lifecycle.
    """

    id: str
    task_type: str
    status: TaskStatus = TaskStatus.PENDING

    progress: Optional[TaskProgress] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Optional[dict] = None

    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# TaskManager
# ---------------------------------------------------------------------------

class TaskManager:
    """
    Async task manager with state machine and concurrency control.

    Features:
    - In-memory task storage (dict-based, single-event-loop safe).
    - State machine: ``pending -> running -> completed / failed / cancelled``.
    - Mutual exclusion via ``cancel_previous``: a new task of the same
      ``task_type`` automatically cancels older non-terminal tasks.
    - Concurrency limit via ``max_concurrent``: excess tasks stay pending
      until a running slot frees up.
    - Background cleanup of old terminal tasks (started by :meth:`start`).

    Usage::

        manager = TaskManager(max_concurrent=3)
        await manager.start()

        task = await manager.create_task(
            "video_generation",
            generate_video(text),
            cancel_previous=True,
            metadata={"text": text},
        )
        status = await manager.get_task_status(task.id)
        await manager.cancel_task(task.id)
        await manager.cleanup_completed(max_age_hours=24)
        await manager.stop()
    """

    def __init__(self, max_concurrent: int = 3):
        self.max_concurrent = max_concurrent

        # task_id -> Task
        self._tasks: dict[str, Task] = {}
        # task_id -> asyncio.Task (the running future)
        self._task_futures: dict[str, asyncio.Task] = {}
        # task_id -> Coroutine (for pending tasks not yet started)
        self._pending_coros: dict[str, Coroutine] = {}
        # task_id -> Coroutine (for running tasks, kept for explicit cleanup
        # in case the asyncio.Task is cancelled before _run_task starts)
        self._task_coros: dict[str, Coroutine] = {}

        self._cleanup_task: Optional[asyncio.Task] = None
        self._running: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the task manager — launches the background cleanup loop."""
        if self._running:
            logger.warning("Task manager already running")
            return
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Task manager started")

    async def stop(self) -> None:
        """
        Stop the task manager.

        Cancels all pending and running tasks, waits for their coroutines to
        settle, then clears all internal state. Safe to call multiple times.
        """
        self._running = False

        # 1. Stop the cleanup loop
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        # 2. Cancel pending tasks (close their coroutines)
        for task_id in list(self._pending_coros.keys()):
            coro = self._pending_coros.pop(task_id, None)
            if coro is not None:
                coro.close()
            task = self._tasks.get(task_id)
            if task is not None and task.status == TaskStatus.PENDING:
                self._transition(task, TaskStatus.CANCELLED)

        # 3. Cancel running futures and wait for them to settle
        futures = list(self._task_futures.values())
        for fut in futures:
            if not fut.done():
                fut.cancel()
        if futures:
            await asyncio.gather(*futures, return_exceptions=True)

        # 3b. Explicitly close any inner coroutines that _run_task may not
        # have closed (e.g. when the asyncio.Task was cancelled before
        # _run_task started running).
        for coro in self._task_coros.values():
            try:
                coro.close()
            except Exception:
                pass

        # 4. Clear everything
        cleared = len(self._tasks)
        self._tasks.clear()
        self._task_futures.clear()
        self._pending_coros.clear()
        self._task_coros.clear()
        if cleared:
            logger.info(f"Task manager stopped (cleared {cleared} tasks)")
        else:
            logger.info("Task manager stopped")

    # ------------------------------------------------------------------
    # Task creation
    # ------------------------------------------------------------------

    async def create_task(
        self,
        task_type: str,
        coro: Coroutine,
        cancel_previous: bool = False,
        metadata: Optional[dict] = None,
    ) -> Task:
        """
        Create and schedule a new task.

        When ``cancel_previous`` is ``True``, every existing non-terminal
        task of the same ``task_type`` is cancelled before the new task is
        created. This provides mutual exclusion for same-type tasks.

        If ``max_concurrent`` running tasks are already in flight, the new
        task stays ``PENDING`` until a slot frees up.

        Args:
            task_type: Category used for mutual exclusion grouping.
            coro: Coroutine to execute.
            cancel_previous: Cancel same-type pending/running tasks first.
            metadata: Optional metadata dict attached to the task.

        Returns:
            The created :class:`Task` (status is RUNNING or PENDING).
        """
        if cancel_previous:
            for tid, existing in list(self._tasks.items()):
                if (
                    existing.task_type == task_type
                    and existing.status not in _TERMINAL_STATES
                ):
                    self._cancel_internal(tid)

        task_id = str(uuid.uuid4())
        task = Task(
            id=task_id,
            task_type=task_type,
            status=TaskStatus.PENDING,
            metadata=metadata,
            created_at=datetime.now(),
        )
        self._tasks[task_id] = task
        self._pending_coros[task_id] = coro

        logger.debug(f"Created task {task_id} ({task_type})")

        # Try to start immediately if a slot is free
        self._schedule_pending()
        return task

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def get_task_status(self, task_id: str) -> Optional[dict]:
        """
        Get task status as a serialisable dict.

        Returns ``None`` if the task does not exist.
        """
        task = self._tasks.get(task_id)
        if task is None:
            return None
        return {
            "task_id": task.id,
            "task_type": task.task_type,
            "status": task.status.value,
            "progress": task.progress.model_dump() if task.progress else None,
            "result": task.result,
            "error": task.error,
            "metadata": task.metadata,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        }

    def get_task(self, task_id: str) -> Optional[Task]:
        """Get the raw Task object by ID (synchronous)."""
        return self._tasks.get(task_id)

    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100,
    ) -> list[Task]:
        """
        List tasks, optionally filtered by status.

        Results are sorted by ``created_at`` descending (newest first).
        """
        tasks = list(self._tasks.values())
        if status is not None:
            tasks = [t for t in tasks if t.status == status]
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        return tasks[:limit]

    # ------------------------------------------------------------------
    # Task control
    # ------------------------------------------------------------------

    async def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a pending or running task.

        Returns ``True`` if the task was cancelled, ``False`` if the task was
        not found or already in a terminal state.
        """
        task = self._tasks.get(task_id)
        if task is None or task.status in _TERMINAL_STATES:
            return False
        self._cancel_internal(task_id)
        return True

    def update_progress(
        self,
        task_id: str,
        current: int,
        total: int,
        message: str = "",
    ) -> None:
        """Update progress for a task (synchronous, no-op if task missing)."""
        task = self._tasks.get(task_id)
        if task is None:
            return
        percentage = (current / total * 100) if total > 0 else 0.0
        task.progress = TaskProgress(
            current=current,
            total=total,
            percentage=percentage,
            message=message,
        )

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def cleanup_completed(self, max_age_hours: int = 24) -> int:
        """
        Remove terminal tasks older than ``max_age_hours``.

        A task is eligible if its ``completed_at`` timestamp is older than
        the cutoff. Running and pending tasks are never removed.

        Returns the number of tasks removed.
        """
        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        to_remove: list[str] = []
        for tid, task in self._tasks.items():
            if task.status in _TERMINAL_STATES:
                if task.completed_at is not None and task.completed_at < cutoff:
                    to_remove.append(tid)

        for tid in to_remove:
            self._tasks.pop(tid, None)
            self._task_futures.pop(tid, None)
            # Close any remaining coroutine references
            coro = self._pending_coros.pop(tid, None)
            if coro is not None:
                try:
                    coro.close()
                except Exception:
                    pass
            coro = self._task_coros.pop(tid, None)
            if coro is not None:
                try:
                    coro.close()
                except Exception:
                    pass

        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} old tasks")
        return len(to_remove)

    # ------------------------------------------------------------------
    # Internal: state machine
    # ------------------------------------------------------------------

    def _transition(self, task: Task, new_status: TaskStatus) -> None:
        """
        Validate and perform a state transition.

        Raises :class:`InvalidStateTransitionError` if the transition is not
        allowed by :data:`_VALID_TRANSITIONS`.
        """
        allowed = _VALID_TRANSITIONS.get(task.status, set())
        if new_status not in allowed:
            raise InvalidStateTransitionError(
                f"Cannot transition from {task.status.value} "
                f"to {new_status.value}"
            )
        task.status = new_status
        if new_status == TaskStatus.RUNNING:
            task.started_at = datetime.now()
        elif new_status in _TERMINAL_STATES:
            task.completed_at = datetime.now()

    # ------------------------------------------------------------------
    # Internal: cancellation
    # ------------------------------------------------------------------

    def _cancel_internal(self, task_id: str) -> None:
        """
        Cancel a task without validation (internal use).

        - Pending tasks: close the stored coroutine.
        - Running tasks: cancel the asyncio future.
        - Terminal tasks: no-op.
        """
        task = self._tasks.get(task_id)
        if task is None or task.status in _TERMINAL_STATES:
            return

        # Close pending coroutine to avoid "coroutine was never awaited" warning
        if task.status == TaskStatus.PENDING:
            coro = self._pending_coros.pop(task_id, None)
            if coro is not None:
                coro.close()

        # Cancel the running asyncio future
        future = self._task_futures.get(task_id)
        if future is not None and not future.done():
            future.cancel()

        # Transition to CANCELLED
        self._transition(task, TaskStatus.CANCELLED)
        logger.debug(f"Cancelled task {task_id}")

    # ------------------------------------------------------------------
    # Internal: scheduling
    # ------------------------------------------------------------------

    def _schedule_pending(self) -> None:
        """
        Start pending tasks while under the ``max_concurrent`` limit.

        This is called after task creation and after a task completes.
        Safe to call multiple times — it only starts tasks that are still
        ``PENDING`` and respects the running count.
        """
        running_count = sum(
            1 for t in self._tasks.values() if t.status == TaskStatus.RUNNING
        )
        for tid, task in list(self._tasks.items()):
            if running_count >= self.max_concurrent:
                break
            if task.status == TaskStatus.PENDING:
                coro = self._pending_coros.pop(tid, None)
                if coro is not None:
                    self._transition(task, TaskStatus.RUNNING)
                    # Keep a reference for explicit cleanup in stop()
                    self._task_coros[tid] = coro
                    self._task_futures[tid] = asyncio.create_task(
                        self._run_task(tid, coro)
                    )
                    running_count += 1

    # ------------------------------------------------------------------
    # Internal: task execution
    # ------------------------------------------------------------------

    async def _run_task(self, task_id: str, coro: Coroutine) -> None:
        """
        Execute a task coroutine and update its state.

        - On success: transition to ``COMPLETED``, store result.
        - On exception: transition to ``FAILED``, store error.
        - On cancellation: transition to ``CANCELLED`` (if not already).

        After the coroutine settles, ``_schedule_pending`` is called to
        start any tasks that were waiting for a free slot.

        The entire body is wrapped in an outer ``try/finally`` so that
        ``coro.close()`` is always called — even when the asyncio Task is
        cancelled before this coroutine starts running (in which case
        ``CancelledError`` is thrown at the first line, before any inner
        ``try`` block).
        """
        try:
            task = self._tasks.get(task_id)
            if task is None:
                return

            try:
                result = await coro
                self._transition(task, TaskStatus.COMPLETED)
                task.result = result
            except asyncio.CancelledError:
                # _cancel_internal may have already set CANCELLED
                if task.status != TaskStatus.CANCELLED:
                    self._transition(task, TaskStatus.CANCELLED)
                raise
            except Exception as exc:
                self._transition(task, TaskStatus.FAILED)
                task.error = str(exc)
                logger.error(f"Task {task_id} failed: {exc}")
        finally:
            self._task_futures.pop(task_id, None)
            self._task_coros.pop(task_id, None)
            # Ensure the inner coroutine is fully closed to avoid
            # "coroutine was never awaited" RuntimeWarnings. Calling close()
            # on an already-done coroutine is a safe no-op.
            try:
                coro.close()
            except Exception:
                pass
            # Start the next pending task if a slot opened up
            self._schedule_pending()

    # ------------------------------------------------------------------
    # Internal: cleanup loop
    # ------------------------------------------------------------------

    async def _cleanup_loop(self) -> None:
        """Background loop that periodically removes old terminal tasks."""
        while self._running:
            try:
                await asyncio.sleep(3600)  # 1 hour
                await self.cleanup_completed(max_age_hours=24)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Error in cleanup loop: {exc}")
