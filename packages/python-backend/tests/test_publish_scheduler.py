"""Tests for PublishScheduler (migrated from legacy)"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest

from multi_publish.core.scheduler import PublishScheduler
from multi_publish.models import PlatformType, PublishTask


@pytest.fixture
def mock_task_queue():
    tq = MagicMock()
    tq.add_task = MagicMock(return_value="task-001")
    return tq


@pytest.fixture
def scheduler(mock_task_queue):
    return PublishScheduler(task_queue=mock_task_queue)


@pytest.fixture
def sample_task():
    return PublishTask(
        id="task-001",
        title="Test",
        content="Content",
        platforms=[PlatformType.WEIBO],
    )


class TestPublishScheduler:
    def test_init(self, scheduler, mock_task_queue):
        assert scheduler.task_queue == mock_task_queue
        assert scheduler._schedules == {}
        assert scheduler._running is False

    def test_add_schedule_once(self, scheduler, sample_task):
        scheduled_at = datetime.now() + timedelta(hours=1)
        sid = scheduler.add_schedule(sample_task, scheduled_at)
        assert sid.startswith("sched-")
        assert sid in scheduler._schedules
        info = scheduler._schedules[sid]
        assert info["type"] == "once"
        assert info["task"] == sample_task

    def test_add_schedule_with_id(self, scheduler, sample_task):
        scheduled_at = datetime.now() + timedelta(hours=1)
        sid = scheduler.add_schedule(sample_task, scheduled_at, schedule_id="my-sched")
        assert sid == "my-sched"

    def test_add_interval_schedule(self, scheduler, sample_task):
        sid = scheduler.add_interval_schedule(sample_task, interval_seconds=300)
        assert sid in scheduler._schedules
        info = scheduler._schedules[sid]
        assert info["type"] == "interval"
        assert info["interval_seconds"] == 300

    def test_remove_schedule(self, scheduler, sample_task):
        sid = scheduler.add_schedule(sample_task, datetime.now() + timedelta(hours=1))
        assert scheduler.remove_schedule(sid) is True
        assert sid not in scheduler._schedules

    def test_remove_missing_schedule(self, scheduler):
        assert scheduler.remove_schedule("nonexistent") is False

    def test_pause_resume_schedule(self, scheduler, sample_task):
        sid = scheduler.add_schedule(sample_task, datetime.now())
        assert scheduler.pause_schedule(sid) is True
        assert scheduler._schedules[sid].get("paused") is True
        assert scheduler.resume_schedule(sid) is True
        assert scheduler._schedules[sid].get("paused") is False

    def test_list_schedules(self, scheduler, sample_task):
        scheduler.add_schedule(sample_task, datetime.now() + timedelta(hours=1), schedule_id="s1")
        scheduler.add_interval_schedule(sample_task, interval_seconds=60, schedule_id="s2")
        schedules = scheduler.list_schedules()
        assert len(schedules) == 2
        types = {s["type"] for s in schedules}
        assert types == {"once", "interval"}


@pytest.mark.asyncio
class TestPublishSchedulerAsync:
    async def test_start_stop(self, scheduler):
        assert scheduler._running is False
        await scheduler.start()
        assert scheduler._running is True
        await scheduler.stop()
        assert scheduler._running is False

    async def test_execute_once_task(self, scheduler, sample_task):
        past_time = datetime.now() - timedelta(minutes=5)
        scheduler.add_schedule(sample_task, past_time, schedule_id="s1")
        info = scheduler._schedules["s1"]
        assert info["executed_at"] is None
        await scheduler._execute_once_task("s1", info)
        scheduler.task_queue.add_task.assert_called_once_with(sample_task)
