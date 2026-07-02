"""Core module test - ProgressReporter"""
import pytest
from datetime import datetime
from multi_publish.core.progress import (
    ProgressReporter, ProgressEvent, PublishStage,
    STAGE_WEIGHTS, create_ipc_progress_callback,
)


class TestPublishStage:
    def test_stage_values(self):
        assert PublishStage.INIT.value == "init"
        assert PublishStage.COMPLETED.value == "completed"
        assert PublishStage.FAILED.value == "failed"

    def test_stage_weights(self):
        for s in PublishStage:
            assert s in STAGE_WEIGHTS


class TestProgressEvent:
    def test_creation(self):
        e = ProgressEvent(task_id="t1", platform="wb",
                          stage=PublishStage.UPLOADING,
                          percent=50, message="up", detail="3/10")
        assert e.task_id == "t1"

    def test_to_dict(self):
        e = ProgressEvent(task_id="t1", platform="wb",
                          stage=PublishStage.COMPLETED,
                          percent=100, message="done")
        d = e.to_dict()
        assert d["taskId"] == "t1"
        assert d["stage"] == "completed"


class TestReporter:
    def test_defaults(self):
        r = ProgressReporter(task_id="t1", platform="wb")
        assert r.callbacks == []

    def test_init_triggers(self):
        ev = []
        r = ProgressReporter("t1", "wb", callbacks=[ev.append])
        r.init("start")
        assert len(ev) == 1
        assert ev[0].stage == PublishStage.INIT

    def test_lifecycle(self):
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

    def test_failure_paths(self):
        r = ProgressReporter("t1", "wb", callbacks=[])
        r.upload_fail("err")
        assert r._last_stage == PublishStage.UPLOAD_FAIL
        r.push_fail("err")
        assert r._last_stage == PublishStage.PUSH_FAIL
        r.failed("err")
        assert r._last_stage == PublishStage.FAILED

    def test_cb_error_safe(self):
        ev = []
        def broken(e):
            raise RuntimeError("x")
        r = ProgressReporter("t1", "wb",
                             callbacks=[broken, ev.append])
        r.init()
        assert len(ev) == 1

    def test_upload_no_total(self):
        r = ProgressReporter("t1", "w", callbacks=[])
        r.uploading(3)
        assert r._last_percent == 25