"""scheduler_simulator — 与桌面端 ApiUsageGovernor 同契约的确定性调度模拟器（纯标准库）。

契约常量与 apps/desktop/electron/services/api-usage-governor.js 保持一致：
  - 并发信号量有界队列 MAX_QUEUE_WAIT_MS=30s
  - RPM 滑动窗口时间槽（WINDOW_MS=60s / rpm）有界 MAX_PACE_WAIT_MS=180s
  - 429 冷却等待有界 MAX_COOLDOWN_WAIT_MS=45s，默认冷却时长 DEFAULT_COOLDOWN_MS=30s
  - 429 自适应 rateFactor ×0.75（下限 0.2），成功 +0.05，_effectiveRpm = max(2, round(rpm*factor))
  - 5h 额度窗口（field=requests）请求前预检即拒（QUOTA_EXCEEDED），不消耗真实调用
  - 并发换算 maxConcurrent = clamp(round(rpm/10), 1, 4)（JS Math.round half-up 语义）

确定性：同参数同结果（事件驱动、无随机），供运营后台验证与桌面端真实自检对拍。
"""
import heapq
import math

WINDOW_MS = 60_000
MAX_QUEUE_WAIT_MS = 30_000
MAX_PACE_WAIT_MS = 180_000
MAX_COOLDOWN_WAIT_MS = 45_000
DEFAULT_COOLDOWN_MS = 30_000
RATE_ADAPT_FACTOR = 0.75
RATE_RECOVER_STEP = 0.05
RATE_FACTOR_MIN = 0.2

MAX_RPM = 100_000
MAX_REQUESTS = 1_000
MAX_DURATION_MS = 60_000
MAX_ARRIVAL_INTERVAL_MS = 60_000
MAX_CONCURRENT_LIMIT = 8
MAX_LIMIT_PER_5H = 10_000_000


def clamp_concurrency(rpm: int) -> int:
    """并发换算：clamp(round(rpm/10), 1, 4)，round 取 JS Math.round half-up 语义。"""
    if not isinstance(rpm, int) or rpm < 1:
        raise ValueError("rpm 必须是大于等于 1 的整数")
    half_up = int(math.floor(rpm / 10 + 0.5))
    return max(1, min(4, half_up))


def _effective_rpm(rpm: int, rate_factor: float) -> int:
    return max(2, int(math.floor(rpm * rate_factor + 0.5)))


def _validate(params: dict) -> dict:
    rpm = params.get("rpm")
    if not isinstance(rpm, int) or isinstance(rpm, bool) or rpm < 1 or rpm > MAX_RPM:
        raise ValueError("rpm 必须是 [1, 100000] 的整数")
    request_count = params.get("request_count")
    if not isinstance(request_count, int) or isinstance(request_count, bool) or request_count < 1 or request_count > MAX_REQUESTS:
        raise ValueError("request_count 必须是 [1, 1000] 的整数")
    duration = params.get("request_duration_ms", 0)
    if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0 or duration > MAX_DURATION_MS:
        raise ValueError("request_duration_ms 必须是 [0, 60000] 的整数")
    interval = params.get("arrival_interval_ms", 0)
    if not isinstance(interval, int) or isinstance(interval, bool) or interval < 0 or interval > MAX_ARRIVAL_INTERVAL_MS:
        raise ValueError("arrival_interval_ms 必须是 [0, 60000] 的整数")
    mc = params.get("max_concurrent")
    if mc is not None and (not isinstance(mc, int) or isinstance(mc, bool) or mc < 1 or mc > MAX_CONCURRENT_LIMIT):
        raise ValueError("max_concurrent 必须是 [1, 8] 的整数或留空")
    if mc is None:
        mc = clamp_concurrency(rpm)
    limit5h = params.get("limit_per_5h")
    if limit5h is not None and (not isinstance(limit5h, int) or isinstance(limit5h, bool) or limit5h < 1 or limit5h > MAX_LIMIT_PER_5H):
        raise ValueError("limit_per_5h 必须是 [1, 10000000] 的整数或留空")
    inject = params.get("inject_429_at")
    if inject is not None and (not isinstance(inject, int) or isinstance(inject, bool) or inject < 1 or inject > request_count):
        raise ValueError("inject_429_at 必须是 [1, request_count] 的整数或留空")
    exceed = bool(params.get("exceed_5h", False))
    return {
        "rpm": rpm,
        "max_concurrent": mc,
        "limit_per_5h": limit5h,
        "request_count": request_count,
        "request_duration_ms": duration,
        "arrival_interval_ms": interval,
        "inject_429_at": inject,
        "exceed_5h": exceed,
        "cooldown_ms": params.get("cooldown_ms", DEFAULT_COOLDOWN_MS),
    }


def simulate(params: dict) -> dict:
    cfg = _validate(params)
    rpm = cfg["rpm"]
    max_concurrent = cfg["max_concurrent"]
    limit5h = cfg["limit_per_5h"]
    n = cfg["request_count"]
    duration = cfg["request_duration_ms"]
    interval = cfg["arrival_interval_ms"]
    inject_at = cfg["inject_429_at"]
    exceed = cfg["exceed_5h"]
    cooldown_ms = cfg["cooldown_ms"]

    now = 0
    next_slot_at = 0
    cooldown_until = 0
    rate_factor = 1.0
    used_5h = 0
    finish_heap = []  # 执行中请求的完成时刻（最小堆）；长度 = 执行中数（started 未 finished）
    executing_now = 0  # 实际执行中请求数（观测口径：started 后 - finished 前，与真实 governor 一致）
    timeline = []
    factor_curve = []
    max_concurrent_observed = 0
    max_queue_wait_ms = 0
    rate_limited_count = 0
    cooldown_count = 0
    quota_exceeded_count = 0
    started_times = []
    end_times = []  # 每个请求的结束时刻（completed=finished；quota/rate_limited=判定时刻）→ 墙钟 total 口径

    def _release(t):
        """释放所有在时刻 t 之前（含）完成的执行（真实时钟推进语义）。"""
        nonlocal executing_now
        while finish_heap and finish_heap[0] <= t:
            heapq.heappop(finish_heap)
            executing_now -= 1

    for i in range(1, n + 1):
        arrive_at = (i - 1) * interval
        now = max(now, arrive_at)
        _release(now)

        t = now
        entry = {
            "req": i, "arrived_at": arrive_at,
            "queued_at": None, "started_at": None, "finished_at": None,
            "state": "queued", "queue_wait_ms": 0, "cooldown_wait_ms": 0,
        }
        queue_wait = 0

        # 1) 并发信号量（transfer：占满时接管最早完成槽；等待从本请求到达时刻起算，不串行化同批后续请求）
        #    超时判定与真实 waiter deadline 一致：本请求到达时刻 + MAX_QUEUE_WAIT_MS（2026-08-13 精确化，
        #    修复 429 长冷却+同批突发时排队请求被乐观放行的问题）；被拒请求 end_time 记 deadline 墙钟时刻。
        if executing_now >= max_concurrent:
            earliest = finish_heap[0]
            wait = earliest - t
            deadline = arrive_at + MAX_QUEUE_WAIT_MS
            if earliest > deadline:
                entry["state"] = "rate_limited"
                rate_limited_count += 1
                end_times.append(deadline)
                timeline.append(entry)
                continue
            heapq.heappop(finish_heap)
            executing_now -= 1
            t = earliest
            queue_wait += wait

        # 2) RPM 时间槽（先同步预约，再判超时；与桌面端 _pace 一致）
        rpm_eff = _effective_rpm(rpm, rate_factor)
        interval_ms = WINDOW_MS / rpm_eff
        slot_base = max(t, next_slot_at)
        next_slot_at = slot_base + interval_ms
        pace_wait = slot_base - t
        if pace_wait > MAX_PACE_WAIT_MS:
            entry["state"] = "rate_limited"
            rate_limited_count += 1
            end_times.append(t)
            timeline.append(entry)
            continue
        t = slot_base
        queue_wait += pace_wait
        # 推进到槽位时刻后，释放所有已完成执行（并发语义：interval < duration 时请求可重叠）
        _release(t)

        # 3) 429 冷却（有界 45s）
        cooldown_wait = 0
        if t < cooldown_until:
            wait = cooldown_until - t
            if wait > MAX_COOLDOWN_WAIT_MS:
                entry["state"] = "rate_limited"
                rate_limited_count += 1
                end_times.append(t)
                timeline.append(entry)
                continue
            t = cooldown_until
            cooldown_wait = wait
            cooldown_count += 1

        # 4) 5h 额度预检（与真实 preflight 位置一致：在 pace/cooldown 之后、执行之前；
        #    被拒请求仍占用 RPM 槽 → 墙钟 total 含其等待，对齐真实 C3 行为）
        if exceed and limit5h is not None and used_5h >= limit5h:
            entry["state"] = "quota_exceeded"
            entry["queue_wait_ms"] = int(queue_wait)
            entry["cooldown_wait_ms"] = int(cooldown_wait)
            quota_exceeded_count += 1
            end_times.append(t)
            timeline.append(entry)
            continue

        entry["queue_wait_ms"] = int(queue_wait)
        entry["cooldown_wait_ms"] = int(cooldown_wait)
        max_queue_wait_ms = max(max_queue_wait_ms, int(queue_wait))
        entry["queued_at"] = int(t)
        entry["started_at"] = int(t)
        started_times.append(int(t))
        finished = int(t + duration)
        entry["finished_at"] = finished
        entry["state"] = "completed"
        heapq.heappush(finish_heap, finished)
        executing_now += 1
        max_concurrent_observed = max(max_concurrent_observed, executing_now)
        used_5h += 1
        end_times.append(finished)
        # 记账：注入 429 → 冷却 + 自适应下调；否则缓慢恢复
        if inject_at is not None and i == inject_at:
            cooldown_until = finished + cooldown_ms
            rate_factor = max(RATE_FACTOR_MIN, rate_factor * RATE_ADAPT_FACTOR)
            rate_limited_count += 1
        else:
            rate_factor = min(1.0, rate_factor + RATE_RECOVER_STEP)
        factor_curve.append({"t": int(finished), "factor": round(rate_factor, 4)})
        timeline.append(entry)
        now = max(now, t)

    # 墙钟 total：全部请求（含被拒/限流的判定时刻）的最晚结束时刻 - 起始 0（对齐真实 runSelfCheck 墙钟口径）
    total_duration_ms = max(end_times) if end_times else 0
    # 吞吐：60s 滑动窗口内最大放行数（与 RPM 预算语义一致）
    throughput_per_min = 0
    for s in started_times:
        c = sum(1 for x in started_times if s <= x < s + WINDOW_MS)
        throughput_per_min = max(throughput_per_min, c)

    assertions = _build_assertions(
        cfg, max_concurrent_observed, rate_limited_count, throughput_per_min,
        max_queue_wait_ms, quota_exceeded_count, timeline,
    )
    metrics = {
        "total_duration_ms": total_duration_ms,
        "throughput_per_min": throughput_per_min,
        "max_concurrent_observed": max_concurrent_observed,
        "max_queue_wait_ms": max_queue_wait_ms,
        "rate_limited_count": rate_limited_count,
        "cooldown_count": cooldown_count,
        "quota_exceeded_count": quota_exceeded_count,
        "rate_factor_curve": factor_curve,
    }
    return {"timeline": timeline, "metrics": metrics, "assertions": assertions, "config": cfg}


def _build_assertions(cfg, mc_observed, rl_count, throughput, max_wait, quota_count, timeline):
    rpm = cfg["rpm"]
    limit5h = cfg["limit_per_5h"]
    exceed = cfg["exceed_5h"]
    inject_at = cfg["inject_429_at"]
    results = []
    results.append({
        "name": "max_concurrent", "pass": mc_observed <= cfg["max_concurrent"],
        "actual": mc_observed, "expected": f"<= {cfg['max_concurrent']}",
        "message": "观测并发峰值不超预算",
    })
    results.append({
        "name": "no_rate_limited", "pass": rl_count == 0,
        "actual": rl_count, "expected": 0,
        "message": "未注入 429 时不应产生限流",
    })
    budget = max(rpm, 2)  # _effectiveRpm 下限 2
    results.append({
        "name": "throughput", "pass": throughput <= budget,
        "actual": throughput, "expected": f"<= {budget}",
        "message": "60s 滑动窗口放行数不超预算（含 effectiveRpm 下限 2）",
    })
    results.append({
        "name": "max_queue_wait", "pass": max_wait < MAX_PACE_WAIT_MS,
        "actual": max_wait, "expected": f"< {MAX_PACE_WAIT_MS}",
        "message": "RPM 时间槽排队有界",
    })
    if exceed and limit5h is not None:
        rejected = [t for t in timeline if t["state"] == "quota_exceeded" and t["req"] == limit5h + 1]
        ok = len(rejected) == 1 and rejected[0]["started_at"] is None
        results.append({
            "name": "quota_at_limit_plus_1", "pass": ok,
            "actual": len(rejected), "expected": f"1 (req={limit5h + 1})",
            "message": "5h 额度第 limit+1 个请求预检拒绝且不执行",
        })
    if cfg["max_concurrent"] == 1:
        completed = [t for t in timeline if t["state"] == "completed"]
        order = [t["req"] for t in sorted(completed, key=lambda t: t["started_at"])]
        ok = order == list(range(1, len(completed) + 1))
        results.append({
            "name": "fifo", "pass": ok, "actual": order[:10], "expected": "1..N",
            "message": "并发=1 时按到达顺序完成",
        })
    return results
