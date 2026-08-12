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
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks() })

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

  it('5h 额度由真实 governor 预检拒绝（第 limit+1 起，count=n-L）', async () => {
    const r = await runSelfCheck({ rpm: 120, maxConcurrent: 2, limitPer5h: 2, requestCount: 4, requestDurationMs: 20 })
    expect(r.metrics.quota_exceeded_count).toBe(2) // 4 - 2
    const byAssert = Object.fromEntries(r.assertions.map(a => [a.name, a]))
    expect(byAssert.quota_at_limit_plus_1.pass).toBe(true)
    // 前 2 次调用成功（第 limit 次允许）
    expect(r.timeline.filter(t => t.state === 'completed')).toHaveLength(2)
  })
})
