// @ts-check
/**
 * rate-limit-self-check.test.js — 桌面端真实 governor 限流自检（P2）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { runSelfCheck, clampConcurrency } = require('./rate-limit-self-check')

describe('rate-limit-self-check 参数与基础', () => {
  it('clampConcurrency 与 model-call-scheduler 一致', () => {
    expect(clampConcurrency(6)).toBe(1)
    expect(clampConcurrency(20)).toBe(2)
    expect(clampConcurrency(25)).toBe(3)
    expect(clampConcurrency(120)).toBe(4)
  })

  it('非法参数被拒绝', async () => {
    for (const bad of [
      { rpm: 0, requestCount: 5 },
      { rpm: 20, requestCount: 0 },
      { rpm: 20, requestCount: 5, requestDurationMs: -1 },
      { rpm: 20, requestCount: 5, maxConcurrent: 0 },
      { rpm: 20, requestCount: 5, inject429At: 99 },
      { rpm: 20, requestCount: 5, limitPer5h: 0 },
    ]) {
      await expect(runSelfCheck(bad)).rejects.toThrow(TypeError)
    }
  })
})

describe('rate-limit-self-check 真实 governor 行为', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  // vi.useFakeTimers() 之后必须显式归还真实时钟：vi.restoreAllMocks() 不管这件事，
  // 否则假时钟会泄漏给同文件后续用例（以及同 worker 的其他文件），表现为「单跑绿、全量挂死」。
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); vi.useRealTimers() })

  it('并发上限被观测且不触发网络', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    const r = await runSelfCheck({ rpm: 120, maxConcurrent: 1, requestCount: 5, requestDurationMs: 40 })
    expect(r.engine).toBe('real-governor')
    expect(r.metrics.max_concurrent_observed).toBeLessThanOrEqual(1)
    expect(r.metrics.rate_limited_count).toBe(0)
    expect(r.metrics.network_calls).toBe(0)
    expect(global.fetch).not.toHaveBeenCalled()
    const byAssert = Object.fromEntries(r.assertions.map(a => [a.name, a]))
    expect(byAssert.max_concurrent.pass).toBe(true)
    expect(byAssert.no_network.pass).toBe(true)
    expect(r.timeline.filter(t => t.state === 'completed')).toHaveLength(5)
  })

  it('注入 429 触发真实 governor 冷却路径', async () => {
    const r = await runSelfCheck({ rpm: 120, maxConcurrent: 2, requestCount: 6, requestDurationMs: 30, inject429At: 3, cooldownMs: 150 })
    expect(r.metrics.rate_limited_count).toBe(1)
    expect(r.timeline.some(t => t.req === 3 && t.state === 'rate_limited')).toBe(true)
    expect(r.metrics.quota_exceeded_count).toBe(0)
  })

  // 墙钟预算：rpm=120 → 时间槽间隔 500ms，4 个请求串行错峰上界约 1.5s；推进 60s 留足余量。
  // 刻意用假时钟——这条用例原先依赖真实 setTimeout 的完成顺序，CI 满载时会把
  // 「已执行却被事后判超额」的请求算进 completed，两个计数器同时偏高（随机红的来源）。
  const runWithClock = async (params) => {
    const p = runSelfCheck(params)
    await vi.advanceTimersByTimeAsync(60000)
    return p
  }

  it('5h 额度由真实 governor 预检拒绝（第 limit+1 起，count=n-L，且被拒请求一次都没执行）', async () => {
    vi.useFakeTimers()
    const r = await runWithClock({ rpm: 120, maxConcurrent: 2, limitPer5h: 2, requestCount: 4, requestDurationMs: 20 })
    expect(r.metrics.quota_exceeded_count).toBe(2) // 4 - 2
    const byAssert = Object.fromEntries(r.assertions.map(a => [a.name, a]))
    expect(byAssert.quota_at_limit_plus_1.pass).toBe(true)
    const completed = r.timeline.filter(t => t.state === 'completed')
    const rejected = r.timeline.filter(t => t.state === 'quota_exceeded')
    // 前 2 次调用成功（第 limit 次允许）
    expect(completed).toHaveLength(2)
    expect(rejected).toHaveLength(2)
    // 守恒式：时间线必须完整覆盖提交数，超额不得再靠「时间线少了几条」反推
    expect(completed.length + rejected.length).toBe(4)
    // 被准入拒 = 一次都没执行，故 started_at 必须为空（与模拟器口径一致）
    expect(rejected.every(t => t.started_at === null)).toBe(true)
  })

  it('并发预算大于额度时，真实执行次数仍恰好等于 limit', async () => {
    vi.useFakeTimers()
    // maxConcurrent=4 > limit=2：这正是原实现会超支的形状（实测执行 5 次）
    const r = await runWithClock({ rpm: 120, maxConcurrent: 4, limitPer5h: 2, requestCount: 6, requestDurationMs: 20 })
    const completed = r.timeline.filter(t => t.state === 'completed')
    const rejected = r.timeline.filter(t => t.state === 'quota_exceeded')
    expect(completed).toHaveLength(2)
    expect(rejected).toHaveLength(4)
    expect(r.metrics.quota_exceeded_count).toBe(4)
    expect(completed.length + rejected.length).toBe(6)
  })
})
