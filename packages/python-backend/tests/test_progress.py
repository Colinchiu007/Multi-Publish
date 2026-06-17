"""Tests for ProgressReporter — real API v2"""
import pytest
from multi_publish.core.progress import (
    ProgressReporter, ProgressEvent, PublishStage, create_ipc_progress_callback,
)


def test_progress_reporter_init():
    r = ProgressReporter(task_id="t1", platform="weibo")
    assert r.task_id == "t1"
    assert r.platform == "weibo"


def test_stage_flow():
    r = ProgressReporter(task_id="t1", platform="weibo")
    r.init(message="开始")
    r.prepare(message="准备中")
    r.uploading(progress=1, total=5, message="上传")
    r.pushing(message="发布")
    r.completed(message="成功")
    assert r._last_stage == PublishStage.COMPLETED


def test_failed():
    r = ProgressReporter(task_id="t1", platform="weibo")
    r.failed(message="超时")
    assert r._last_stage == PublishStage.FAILED


def test_callback_invoked():
    events = []
    r = ProgressReporter(task_id="t1", platform="weibo", callbacks=[events.append])
    r.init()
    r.completed()
    assert len(events) == 2
    assert events[0].stage == PublishStage.INIT


def test_ipc_callback():
    ipc_events = []
    cb = create_ipc_progress_callback(lambda ch, d: ipc_events.append((ch, d)))
    cb(ProgressEvent(task_id="t1", platform="weibo", stage=PublishStage.UPLOADING, percent=50, message="uploading"))
    assert len(ipc_events) == 1
    assert ipc_events[0][0] == "publish:progress"


def test_audit_stages():
    r = ProgressReporter(task_id="t1", platform="weibo")
    r.audit_waiting()
    assert r._last_stage == PublishStage.AUDIT_WAITING
    r.audit_pass()
    assert r._last_stage == PublishStage.AUDIT_PASS
    r.audit_deny()
    assert r._last_stage == PublishStage.AUDIT_DENY