"""Tests for base publisher infrastructure - ProgressThrottle."""

from multi_publish.publishers.base import ProgressThrottle


class TestProgressThrottle:
    def test_init_defaults(self):
        t = ProgressThrottle()
        assert t._min_interval == 5.0
        assert t._min_percent_delta == 10

    def test_custom_params(self):
        t = ProgressThrottle(min_interval=1.0, min_percent_delta=5)
        assert t._min_interval == 1.0
        assert t._min_percent_delta == 5

    def test_should_report_100_always(self):
        t = ProgressThrottle(min_interval=9999, min_percent_delta=999)
        assert t.should_report(100) is True

    def test_should_report_first_call(self):
        t = ProgressThrottle()
        assert t.should_report(50) is True

    def test_percent_delta_not_blocking_when_time_elapsed(self):
        t = ProgressThrottle(min_interval=0, min_percent_delta=20)
        assert t.should_report(10) is True
        assert t.should_report(15) is True  # min_interval=0 bypasses time check
        assert t.should_report(35) is True

    def test_reset_clears_state(self):
        t = ProgressThrottle(min_interval=0, min_percent_delta=10)
        t.should_report(10)
        t.should_report(15)
        t.reset()
        assert t.should_report(5) is True
        assert t._last_percent == 5
        assert t._last_time > 0

    def test_time_interval_blocks_when_set(self):
        t = ProgressThrottle(min_interval=9999, min_percent_delta=1)
        t.should_report(1)
        assert t.should_report(100) is True  # 100 always bypasses
