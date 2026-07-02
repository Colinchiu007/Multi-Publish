"""Core module test - TaskQueue"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from multi_publish.core.task_queue import TaskQueue, QueueStats
from multi_publish.models import PublishTask, PlatformType, TaskStatus, PublishResult


@pytest.fixture
def mock_publisher():
    p = AsyncMock()
    p.publish.return_value = PublishResult(
        success=True, platform="weibo", url="https://weibo.com/123"
    )
    return p


@pytest.fixture
def task_queue(mock_publisher):
    pm = MagicMock()
    pm.ensure_initialized = AsyncMock(return_value=mock_publisher)
    return TaskQueue(publisher_manager=pm, max_concurrent=3)


@pytest.fixture
def sample_task():
    return PublishTask(
        id="task-001",
        title="Test Title",
        content="Test Content",
        platforms=[PlatformType.WEIBO],
    )


class TestQueueStats:
    def test_defaults(self):
        s = QueueStats()
        assert s.total == 0
        assert s.pending == 0
        assert s.running == 0
        assert s.success == 0
        assert s.failed == 0
        assert s.cancelled == 0


class TestTaskQueueInit:
    def test_init(self, task_queue):
        assert task_queue.max_concurrent == 3
        assert len(task_queue._tasks) == 0
        assert task_queue._running is False

    def test_add_task(self, task_queue, sample_task):
        tid = task_queue.add_task(sample_task)
        assert tid == "task-001"
        assert task_queue.get_task("task-001") == sample_task

    def test_get_task_missing(self, task_queue):
        assert task_queue.get_task("nonexistent") is None

    def test_remove_task(self, task_queue, sample_task):
        task_queue.add_task(sample_task)
        removed = task_queue.remove_task("task-001")
        assert removed == sample_task
        assert task_queue.get_task("task-001") is None

    def test_list_tasks(self, task_queue):
        t1 = PublishTask(id="t1", title="T1", content="", platforms=[])
        t2 = PublishTask(id="t2", title="T2", content="", platforms=[])
        task_queue.add_task(t1)
        task_queue.add_task(t2)
        tasks = task_queue.list_tasks()
        assert len(tasks) == 2

    def test_list_tasks_with_status(self, task_queue):
        t1 = PublishTask(id="t1", title="T1", content="",
                         platforms=[], status=TaskStatus.SUCCESS)
        t2 = PublishTask(id="t2", title="T2", content="",
                         platforms=[], status=TaskStatus.FAILED)
        task_queue.add_task(t1)
        task_queue.add_task(t2)
        success = task_queue.list_tasks(status=TaskStatus.SUCCESS)
        assert len(success) == 1
        assert success[0].id == "t1"

    @pytest.mark.asyncio
    async def test_cancel_queued_task(self, task_queue, sample_task):
        task_queue.add_task(sample_task)
        result = await task_queue.cancel_task("task-001")
        assert result is True
        assert sample_task.status == TaskStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_cancel_finished_task(self, task_queue, sample_task):
        sample_task.status = TaskStatus.SUCCESS
        task_queue.add_task(sample_task)
        result = await task_queue.cancel_task("task-001")
        assert result is False

    @pytest.mark.asyncio
    async def test_cancel_missing_task(self, task_queue):
        result = await task_queue.cancel_task("nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_retry_failed_task(self, task_queue, sample_task):
        sample_task.status = TaskStatus.FAILED
        task_queue.add_task(sample_task)
        result = await task_queue.retry_task("task-001")
        assert result is True
        assert sample_task.status == TaskStatus.PENDING
        assert sample_task.retry_count == 1

    @pytest.mark.asyncio
    async def test_retry_not_failed(self, task_queue, sample_task):
        sample_task.status = TaskStatus.SUCCESS
        task_queue.add_task(sample_task)
        result = await task_queue.retry_task("task-001")
        assert result is False

    @pytest.mark.asyncio
    async def test_retry_maxed(self, task_queue, sample_task):
        sample_task.status = TaskStatus.FAILED
        sample_task.retry_count = sample_task.max_retries
        task_queue.add_task(sample_task)
        result = await task_queue.retry_task("task-001")
        assert result is False


class TestTaskQueueStats:
    def test_empty_stats(self, task_queue):
        stats = task_queue.get_stats()
        assert stats.total == 0
        assert stats.pending == 0

    def test_stats_with_tasks(self, task_queue):
        t1 = PublishTask(id="t1", title="", content="", platforms=[],
                         status=TaskStatus.PENDING)
        t2 = PublishTask(id="t2", title="", content="", platforms=[],
                         status=TaskStatus.RUNNING)
        t3 = PublishTask(id="t3", title="", content="", platforms=[],
                         status=TaskStatus.SUCCESS)
        t4 = PublishTask(id="t4", title="", content="", platforms=[],
                         status=TaskStatus.FAILED)
        t5 = PublishTask(id="t5", title="", content="", platforms=[],
                         status=TaskStatus.CANCELLED)
        for t in [t1, t2, t3, t4, t5]:
            task_queue.add_task(t)
        stats = task_queue.get_stats()
        assert stats.total == 5
        assert stats.pending == 1
        assert stats.running == 1
        assert stats.success == 1
        assert stats.failed == 1
        assert stats.cancelled == 1

    def test_to_dict(self, task_queue):
        d = task_queue.to_dict()
        assert "tasks" in d
        assert "stats" in d
        assert "running_count" in d


@pytest.mark.asyncio
class TestTaskQueueAsync:
    async def test_start_stop(self, task_queue):
        assert task_queue._running is False
        await task_queue.start()
        assert task_queue._running is True
        await task_queue.stop()
        assert task_queue._running is False

    async def test_execute_task_success(self, task_queue, sample_task, mock_publisher):
        task_queue._running = True
        await task_queue._execute_task(sample_task)
        assert sample_task.status == TaskStatus.SUCCESS
        assert PlatformType.WEIBO in sample_task.results

    async def test_execute_task_failure(self, task_queue, sample_task, mock_publisher):
        mock_publisher.publish.side_effect = Exception("Publish failed")
        task_queue._running = True
        await task_queue._execute_task(sample_task)
        assert sample_task.status == TaskStatus.FAILED

    async def test_execute_cancelled_task(self, task_queue, sample_task):
        sample_task.status = TaskStatus.CANCELLED
        task_queue._running = True
        await task_queue._execute_task(sample_task)
        assert sample_task.status == TaskStatus.CANCELLED