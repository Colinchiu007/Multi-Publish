"""Tests for StateQueryScheduler — real API v3"""
import pytest
from multi_publish.core.task_scheduler import StateQueryScheduler, StateQueryTask


def test_state_query_task():
    async def mock_cb():
        pass
    t = StateQueryTask(task_id="t1", key="weibo:acc_01", callback=mock_cb)
    assert t.task_id == "t1"
    assert t.key == "weibo:acc_01"
    assert t.retry_count == 0


def test_push_task():
    s = StateQueryScheduler()
    async def mock_cb():
        pass
    t = StateQueryTask(task_id="t1", key="weibo:acc_01", callback=mock_cb)
    s.push(t)
    assert len(s._tasks) > 0


@pytest.mark.asyncio
async def test_scheduler_start_stop():
    s = StateQueryScheduler()
    await s.start()
    assert s._running is True
    await s.stop()
    assert s._running is False
