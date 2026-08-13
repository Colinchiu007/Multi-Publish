"""scheduler_simulator 单元测试 — 与桌面端 ApiUsageGovernor 契约对拍的确定性模拟器。"""
import pytest

from services.scheduler_simulator import clamp_concurrency, simulate


def test_clamp_concurrency_formula():
    # clamp(round(rpm/10), 1, 4)
    assert clamp_concurrency(6) == 1
    assert clamp_concurrency(15) == 2  # round(1.5)=2
    assert clamp_concurrency(20) == 2
    assert clamp_concurrency(45) == 4  # round(4.5)=5 -> cap 4
    assert clamp_concurrency(120) == 4
    assert clamp_concurrency(1) == 1


def test_simulate_deterministic():
    p1 = dict(rpm=20, request_count=10, request_duration_ms=100)
    p2 = dict(rpm=20, request_count=10, request_duration_ms=100)
    assert simulate(p1)["timeline"] == simulate(p2)["timeline"]
    assert simulate(p1)["metrics"] == simulate(p2)["metrics"]


def test_concurrency_cap_observed():
    # rpm=20 -> maxConcurrent=2；10 请求同时到达，观测并发峰值 <= 2，未注入 429 时无限流
    r = simulate(dict(rpm=20, request_count=10, request_duration_ms=100, arrival_interval_ms=0))
    assert r["metrics"]["max_concurrent_observed"] <= 2
    assert r["metrics"]["rate_limited_count"] == 0
    assert r["metrics"]["quota_exceeded_count"] == 0
    by_assert = {a["name"]: a for a in r["assertions"]}
    assert by_assert["max_concurrent"]["pass"] is True
    assert by_assert["no_rate_limited"]["pass"] is True


def test_rpm_queuing_and_fifo():
    # rpm=6, maxConcurrent=1, 8 请求：排队发生、吞吐不超预算、最长等待 < 180s、FIFO
    r = simulate(dict(rpm=6, max_concurrent=1, request_count=8, request_duration_ms=50))
    m = r["metrics"]
    assert m["max_concurrent_observed"] == 1
    assert m["max_queue_wait_ms"] < 180000
    assert m["throughput_per_min"] <= 6
    by_assert = {a["name"]: a for a in r["assertions"]}
    assert by_assert["max_queue_wait"]["pass"] is True
    assert by_assert["fifo"]["pass"] is True
    # 排队确实发生：至少一个请求 queued_wait > 0
    assert any(t["queue_wait_ms"] > 0 for t in r["timeline"])


def test_429_cooldown_adaptive():
    r = simulate(dict(rpm=20, request_count=8, request_duration_ms=50, inject_429_at=3))
    m = r["metrics"]
    # 精确语义（2026-08-13 waiter deadline）：注入 429 触发 30s 冷却，期间同批后续 3 个请求
    # 在并发信号量排队超过 30s deadline 被拒 → rate_limited = 注入 1 + 排队超时 3 = 4。
    # （真实 runSelfCheck 对排队超时请求不计数（观测盲区）只显示 1；模拟器反映 governor 内部真实行为。）
    assert m["rate_limited_count"] == 4
    assert m["cooldown_count"] >= 1
    # rateFactor 先下调后恢复
    factors = [p["factor"] for p in m["rate_factor_curve"]]
    assert factors[0] == 1.0
    assert min(factors) < 1.0
    assert factors[-1] >= min(factors)
    # 注入场景 no_rate_limited 断言应为 False（如实反映）
    by_assert = {a["name"]: a for a in r["assertions"]}
    assert by_assert["no_rate_limited"]["pass"] is False


def test_5h_quota_preflight():
    r = simulate(dict(rpm=20, limit_per_5h=3, request_count=6, request_duration_ms=50, exceed_5h=True))
    m = r["metrics"]
    # 5h 限额 L=3：第 4 个起全部预检拒绝（count = n - L = 3）
    assert m["quota_exceeded_count"] == 3
    rejected = [t for t in r["timeline"] if t["state"] == "quota_exceeded"]
    assert len(rejected) == 3
    assert rejected[0]["req"] == 4  # 1-based 第 4 个起
    assert rejected[0]["started_at"] is None
    by_assert = {a["name"]: a for a in r["assertions"]}
    assert by_assert["quota_at_limit_plus_1"]["pass"] is True


def test_no_quota_without_exceed_flag():
    # 未开启 exceed_5h 时不做 5h 预检
    r = simulate(dict(rpm=20, limit_per_5h=3, request_count=6, request_duration_ms=50, exceed_5h=False))
    assert r["metrics"]["quota_exceeded_count"] == 0
    assert all(t["state"] != "quota_exceeded" for t in r["timeline"])


def test_invalid_params_rejected():
    for bad in [
        dict(rpm=0, request_count=5),
        dict(rpm=-1, request_count=5),
        dict(rpm=100001, request_count=5),
        dict(rpm=20, request_count=0),
        dict(rpm=20, request_count=1001),
        dict(rpm=20, request_count=5, request_duration_ms=-1),
        dict(rpm=20, request_count=5, max_concurrent=0),
        dict(rpm=20, request_count=5, inject_429_at=0),
        dict(rpm=20, request_count=5, inject_429_at=6),
    ]:
        with pytest.raises(ValueError):
            simulate(bad)


def test_metrics_shape():
    r = simulate(dict(rpm=20, request_count=5, request_duration_ms=100))
    m = r["metrics"]
    for key in ("total_duration_ms", "throughput_per_min", "max_concurrent_observed",
                "max_queue_wait_ms", "rate_limited_count", "cooldown_count",
                "quota_exceeded_count", "rate_factor_curve"):
        assert key in m
    assert len(r["timeline"]) == 5
    assert len(r["assertions"]) >= 4


def test_concurrent_progression_interval_lt_duration():
    """并发推进：interval(1000ms) < duration(2500ms) 时请求可重叠执行，maxc 打到预算 2。"""
    r = simulate(dict(rpm=60, max_concurrent=2, request_count=8, request_duration_ms=2500, arrival_interval_ms=0))
    m = r["metrics"]
    assert m["max_concurrent_observed"] == 2
    assert m["rate_limited_count"] == 0
    assert m["quota_exceeded_count"] == 0
    assert m["throughput_per_min"] <= max(60, 2)
    # 同时到达 8 请求，interval<duration 下总时长 < 串行(8*1000)，约 11s（8 槽 0..7000 + 2500）
    assert 9000 <= m["total_duration_ms"] <= 12000
    assert all(t["state"] == "completed" for t in r["timeline"])
    # 完成顺序按 started 序 == 到达序（并发=2 时仍按槽位先后开始）
    completed = [t["req"] for t in sorted(r["timeline"], key=lambda x: x["started_at"])]
    assert completed == list(range(1, 9))


def test_serial_when_interval_gt_duration():
    """interval(3000ms) > duration(100ms) 时请求严格串行，maxc=1（与真实 governor 一致）。"""
    r = simulate(dict(rpm=20, max_concurrent=2, request_count=8, request_duration_ms=100, arrival_interval_ms=0))
    m = r["metrics"]
    assert m["max_concurrent_observed"] == 1
    assert m["rate_limited_count"] == 0
    assert m["total_duration_ms"] == 7 * 3000 + 100


def test_semaphore_waiter_deadline_long_cooldown():
    """429 长冷却 + 同批突发：排队请求在信号量等待超过 30s deadline 被拒（真实 governor 内部语义）。"""
    r = simulate(dict(rpm=20, request_count=8, request_duration_ms=50, inject_429_at=3, cooldown_ms=30000))
    m = r["metrics"]
    # 注入 429 1 个 + 排队超时 3 个（req6-8 在 cooldown 期间等待 > 30s deadline）
    assert m["rate_limited_count"] == 4
    assert m["cooldown_count"] >= 1
    states = [t["state"] for t in r["timeline"]]
    # 注入 429 的 req3 记账为 rate_limited_count（状态 completed）；排队超时 3 个状态为 rate_limited
    assert states.count("rate_limited") == 3
    assert states.count("completed") == 5
    # 被拒请求 deadline 墙钟 = 到达时刻 + 30s；total 墙钟 ≥ 冷却后最后完成时刻
    assert m["total_duration_ms"] >= 30000

