import { afterEach, describe, expect, it, vi } from 'vitest'

const { ApiUsageGovernor } = require('./api-usage-governor')
const { ProviderError, ERROR_CODES, classifyProviderFailure } = require('./adapters/_base/provider-error')

afterEach(() => {
  vi.useRealTimers()
})

describe('ApiUsageGovernor 并发/限流/排队/重试', () => {
  it('maxConcurrent=1 时第二个调用排队等待，不并行', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 1, rpm: 1000, cooldownMs: 1000, retry429: 3 })
    let release
    const gate = new Promise((r) => { release = r })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(1); await gate; return 'a' })
    await vi.advanceTimersByTimeAsync(0)
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(2); return 'b' })
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toEqual([1])
    release()
    await vi.advanceTimersByTimeAsync(0)
    await p1
    await vi.advanceTimersByTimeAsync(0)
    await p2
    expect(calls).toEqual([1, 2])
  })

  it('RPM 限流：超预算时排队等待窗口释放，等待超过预算则给出明确限流提示', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 4, rpm: 2, cooldownMs: 1000, retry429: 3 })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(1); return 'a' })
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(2); return 'b' })
    // 第 3 个请求超出 RPM 预算，且窗口释放需等待约 60s > 30s 排队预算 → 明确限流错误
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(3); return 'c' })
    const a3 = expect(p3).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await vi.advanceTimersByTimeAsync(0)
    await p1
    await p2
    expect(calls).toEqual([1, 2])
    await a3
    expect(g.getStatus('p:llm:m').recentWindowCount).toBe(2)
  })

  it('429 触发冷却与退避重试后成功', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 100, cooldownMs: 9000, retry429: 3 })
    let attempts = 0
    const promise = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
      attempts += 1
      if (attempts < 3) throw new ProviderError(ERROR_CODES.RATE_LIMITED, 'rate limit', { statusCode: 429 })
      return { content: 'ok' }
    })
    await vi.advanceTimersByTimeAsync(45000)
    const result = await promise
    expect(result).toEqual({ content: 'ok' })
    expect(attempts).toBe(3)
    // 429 触发自适应下调 RPM 预算，成功后才缓慢恢复
    expect(g.getStatus('p:llm:m').rateFactor).toBeLessThan(1)
  })

  it('429 持续存在时按 retry429 上限失败并保留冷却状态', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 100, cooldownMs: 5000, retry429: 2 })
    let attempts = 0
    const promise = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
      attempts += 1
      throw new ProviderError(ERROR_CODES.RATE_LIMITED, 'You have reached the API rate limit', { statusCode: 429 })
    })
    const assertion = expect(promise).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await vi.advanceTimersByTimeAsync(30000)
    await assertion
    expect(attempts).toBe(2)
  })

  it('额度耗尽（QUOTA_EXCEEDED）不重试，立即失败', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 100, retry429: 3 })
    let attempts = 0
    const promise = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
      attempts += 1
      throw new ProviderError(ERROR_CODES.QUOTA_EXCEEDED, 'Insufficient balance', { statusCode: 402 })
    })
    const assertion = expect(promise).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(attempts).toBe(1)
  })

  it('超时等瞬时错误短退避重试', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 100, cooldownMs: 1000, retry429: 3 })
    let attempts = 0
    const promise = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
      attempts += 1
      if (attempts <= 1) throw new ProviderError(ERROR_CODES.TIMEOUT, 'timed out')
      return 'ok'
    })
    await vi.advanceTimersByTimeAsync(3000)
    await expect(promise).resolves.toBe('ok')
    expect(attempts).toBe(2)
  })

  it('token 额度窗口（5 小时）超限时拒绝并给出明确原因', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 100, retry429: 3 })
    g.setTokenWindows('p:llm:m', [{ windowMs: 5 * 3600 * 1000, limit: 1000, field: 'total_tokens' }])
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ usage: { total_tokens: 600 } }))
    const a1 = expect(p1).resolves.toMatchObject({ usage: { total_tokens: 600 } })
    await vi.advanceTimersByTimeAsync(0)
    await a1
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ usage: { total_tokens: 600 } }))
    const a2 = expect(p2).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await vi.advanceTimersByTimeAsync(0)
    await a2
  })

  it('错误分类：429/限流文本、额度文本、超时、内容政策', () => {
    expect(classifyProviderFailure(new ProviderError(ERROR_CODES.RATE_LIMITED, 'x'))).toBe('rate')
    expect(classifyProviderFailure(new ProviderError(ERROR_CODES.QUOTA_EXCEEDED, 'x'))).toBe('quota')
    expect(classifyProviderFailure({ message: "You've reached the API rate limit for free users" })).toBe('rate')
    expect(classifyProviderFailure({ message: 'Insufficient balance for token plan' })).toBe('quota')
    expect(classifyProviderFailure({ message: 'Your token quota for this 5-hour window has been exhausted' })).toBe('quota')
    expect(classifyProviderFailure({ message: 'request timed out' })).toBe('transient')
    expect(classifyProviderFailure({ message: 'content policy rejected' })).toBe('content_policy')
    expect(classifyProviderFailure({ message: 'invalid api key' })).toBe('other')
  })
})
