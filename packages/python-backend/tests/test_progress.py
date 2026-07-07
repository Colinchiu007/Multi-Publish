"""Tests for ProgressReporter ? merged (new + legacy)"""
import pytest
from multi_publish.core.progress import (
    ProgressReporter, ProgressEvent, PublishStage,
    STAGE_WEIGHTS, create_ipc_progress_callback,
)

def test_progress_reporter_init():
    r = ProgressReporter(task_id="t1", platform="weibo")
    assert r.task_id == "t1"
    assert r.platform == "weibo"

def test_stage_flow():
    r = ProgressReporter(task_id="t1", platform="weibo")
    r.init(message="??")
    r.prepare(message="???")
    r.uploading(progress=1, total=5, message="??")
    r.pushing(message="??")
    r.completed(message="??")
    assert r._last_stage == PublishStage.COMPLETED

def test_failed():
    r = ProgressReporter(task_id="t1", platform="weibo")
    r.failed(message="??")
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

def test_stage_values():
    assert PublishStage.INIT.value == "init"
    assert PublishStage.COMPLETED.value == "completed"
    assert PublishStage.FAILED.value == "failed"

def test_stage_weights():
    for s in PublishStage:
        assert s in STAGE_WEIGHTS

def test_event_creation():
    e = ProgressEvent(task_id="t1", platform="wb",
                      stage=PublishStage.UPLOADING,
                      percent=50, message="up", detail="3/10")
    assert e.task_id == "t1"

def test_event_to_dict():
    e = ProgressEvent(task_id="t1", platform="wb",
                      stage=PublishStage.COMPLETED,
                      percent=100, message="done")
    d = e.to_dict()
    assert d["taskId"] == "t1"
    assert d["stage"] == "completed"

def test_report_defaults():
    r = ProgressReporter(task_id="t1", platform="wb")
    assert r.callbacks == []

def test_init_triggers():
    ev = []
    r = ProgressReporter("t1", "wb", callbacks=[ev.append])
    r.init("start")
    assert len(ev) == 1
    assert ev[0].stage == PublishStage.INIT

def test_lifecycle():
    r = ProgressReporter("t1", "wb", callbacks=[])
    r.init()
    assert r._last_stage == PublishStage.INIT
    r.prepare()
    assert r._last_stage == PublishStage.PREPARE
    r.uploading(5, 10)
    assert r._last_stage == PublishStage.UPLOADING
    r.upload_success()
    assert r._last_stage == PublishStage.UPLOAD_SUCCESS
    r.pushing()
    assert r._last_stage == PublishStage.PUSHING
    r.completed()
    assert r._last_stage == PublishStage.COMPLETED
    assert r._last_percent == 100

def test_failure_paths():
    r = ProgressReporter("t1", "wb", callbacks=[])
    r.upload_fail("err")
    assert r._last_stage == PublishStage.UPLOAD_FAIL
    r.push_fail("err")
    assert r._last_stage == PublishStage.PUSH_FAIL
    r.failed("err")
    assert r._last_stage == PublishStage.FAILED

def test_cb_error_safe():
    ev = []
    def broken(e):
        raise RuntimeError("x")
    r = ProgressReporter("t1", "wb",
                         callbacks=[broken, ev.append])
    r.init()
    assert len(ev) == 1

def test_upload_no_total():
    r = ProgressReporter("t1", "w", callbacks=[])
    r.uploading(3)
    assert r._last_percent == 25
