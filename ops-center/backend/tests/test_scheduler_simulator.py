"""scheduler_simulator 单元测试 — 与桌面端 ApiUsageGovernor 契约对拍的确定性模拟器。"""
import pytest

from services.scheduler_simulator import _build_assertions, clamp_concurrency, simulate


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
    # 注入 429 的 req3 语义是"被拒、没做成"：与真实侧同一身份 rate_limited（不再记 completed）；
    # 排队超时 3 个 + 注入 1 个 = 4 条 rate_limited 状态；8 - 4 = 4 条 completed。
    assert states.count("rate_limited") == 4
    assert states.count("completed") == 4
    # 被拒请求 deadline 墙钟 = 到达时刻 + 30s；total 墙钟 ≥ 冷却后最后完成时刻
    assert m["total_duration_ms"] >= 30000

def test_injected_429_is_not_completed_but_keeps_accounting():
    """#2626：注入 429 的那条请求身份必须是 rate_limited（真实侧从未完成）。

    这条用例有两层，缺一不可：
    ① 身份：state / finished_at / 「completed 序列里不含它」；
    ② **边界**：只改身份，槽位占用、墙钟与两个计数四项必须逐项不变。
       下面四个基准值取自改动前对同一组参数的实测（design.md §D2），
       它们是这组断言的全部依据。有人"顺手把堆记账也改真实"时，这里当场红 ——
       那属于另一件事（真实侧 429 占用 ≈0ms vs 模拟器占满 duration，已登记在 #2626 评论）。
    """
    params = dict(rpm=120, max_concurrent=2, request_count=6, request_duration_ms=20,
                  inject_429_at=3, cooldown_ms=300)
    r = simulate(params)
    inj = next(t for t in r["timeline"] if t["req"] == 3)

    # ① 身份
    assert inj["state"] == "rate_limited"
    assert inj["finished_at"] is None
    completed = [t["req"] for t in r["timeline"] if t["state"] == "completed"]
    assert completed == [1, 2, 4, 5, 6]  # 与真实侧 runSelfCheck 的完成序列同一形状

    # ② 边界：占用过（started_at 有值），但四项指标不得跟着身份一起漂
    assert inj["started_at"] == 1000
    m = r["metrics"]
    assert m["max_concurrent_observed"] == 1
    assert m["total_duration_ms"] == 2811
    assert m["rate_limited_count"] == 1
    assert m["cooldown_count"] == 0

def test_fifo_assertion_survives_rejected_requests():
    """#2626 的直接后果：被拒请求不再计入 completed，FIFO 判据必须改为"序号单调不减"。

    原判据 `order == 1..N` 隐含了"每个请求都会完成"，于是 max_concurrent=1 + 注入 429
    这组**顺序本来是对的**配置会被判成 FIFO 失败 —— 运营者在验证详情里看到一条假失败。
    负控直接把乱序 timeline 喂给 `_build_assertions`，证明改后的判据不是恒真。
    """
    r = simulate(dict(rpm=6, max_concurrent=1, request_count=4, request_duration_ms=20,
                      inject_429_at=2, cooldown_ms=300))
    fifo = {a["name"]: a for a in r["assertions"]}["fifo"]
    assert fifo["pass"] is True
    assert fifo["actual"] == [1, 3, 4]           # 被拒的 req2 不在完成序列里

    out_of_order = [
        {"req": 2, "state": "completed", "started_at": 0},
        {"req": 1, "state": "completed", "started_at": 10},
        {"req": 3, "state": "completed", "started_at": 20},
    ]
    neg = {a["name"]: a for a in _build_assertions(r["config"], 1, 0, 1, 0, 0, out_of_order)}["fifo"]
    assert neg["pass"] is False                   # 真乱序仍必须被抓到
    assert neg["actual"] == [2, 1, 3]


def test_injected_429_still_consumes_5h_quota():
    """`used_5h` 不进 metrics，所以它的口径由**可见代理** `quota_exceeded_count` 锚定。

    桌面端 2026-09-28 起是"准入即占额度"（#2566）：被 429 拒掉的调用照样消耗 5h 计数。
    本例在同一组参数下跑"不注入"和"注入 req2"两次，两者的超额起点必须一致（都恰好 3 条被额度拒），
    并且注入那次的完成集合里不能有 req2。若有人把 `used_5h += 1` 改成"被 429 就不计额度"，
    超额条数会少 1（req4 会挤进来完成）⇒ 这里当场红。
    """
    base = dict(rpm=20, max_concurrent=2, limit_per_5h=3, request_count=6,
                request_duration_ms=50, exceed_5h=True)
    plain = simulate(dict(base, inject_429_at=None))
    with_inj = simulate(dict(base, inject_429_at=2, cooldown_ms=300))

    assert plain["metrics"]["quota_exceeded_count"] == 3
    assert with_inj["metrics"]["quota_exceeded_count"] == 3   # 被 429 仍占额度 ⇒ 超额起点不移动
    completed = [t["req"] for t in with_inj["timeline"] if t["state"] == "completed"]
    assert completed == [1, 3]                                # req2 不在完成集合里
    assert with_inj["metrics"]["rate_limited_count"] == 1
