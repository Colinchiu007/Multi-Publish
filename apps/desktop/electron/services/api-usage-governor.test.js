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
    // p2 需要推进其预约的时间槽（rpm=1000 → 间隔 0.06ms）
    await vi.advanceTimersByTimeAsync(100)
    await p2
    expect(calls).toEqual([1, 2])
  })

  it('RPM 限流：超预算请求按时间槽排队错峰，不直接失败', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 4, rpm: 2, cooldownMs: 1000, retry429: 3 })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(1); return 'a' })
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(2); return 'b' })
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(3); return 'c' })
    await vi.advanceTimersByTimeAsync(0)
    await p1
    expect(calls).toEqual([1])
    await vi.advanceTimersByTimeAsync(30000)
    await p2
    expect(calls).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(30000)
    await p3
    expect(calls).toEqual([1, 2, 3])
    expect(g.getStatus('p:llm:m').nextSlotAt).toBeGreaterThan(0)
  })

  it('RPM 排队超过等待预算时给出明确限流提示（有界不无限等）', async () => {
    // 无 sleep 路径（等待 60s 远超 10ms 预算 → 立即抛错），真实定时器即可，确定性
    const g = new ApiUsageGovernor({ maxPaceWaitMs: 10 })
    g.setLimits('p:llm:m', { maxConcurrent: 8, rpm: 1, cooldownMs: 1000, retry429: 3 })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(1); return 'a' })
    // rpm=1 → 时间槽间隔 60s > 10ms 等待预算 → 明确限流提示
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(2); return 'b' })
    await p1
    await expect(p2).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(calls).toEqual([1])
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
    // p2 需先推进其时间槽（rpm=100 → 间隔 600ms）
    await vi.advanceTimersByTimeAsync(1000)
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

  // ─── W2：排队超时回收 ─────────────────────────────────
  it('W2：过期排队 waiter 在无后续释放时被 sweepAll 回收', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({ maxPaceWaitMs: 10000 })
    g.setLimits('p:llm:m', { maxConcurrent: 1, rpm: 1000, cooldownMs: 1000, retry429: 3 })
    let release
    const gate = new Promise((r) => { release = r })
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { await gate; return 'a' })
    await vi.advanceTimersByTimeAsync(0)
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => 'b')
    const p2Rejected = expect(p2).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    // 推进超过排队截止时间（MAX_QUEUE_WAIT_MS=30s），期间无任何释放
    await vi.advanceTimersByTimeAsync(31000)
    g.sweepAll()
    await p2Rejected
    release()
    await p1
    expect(g.getStatus('p:llm:m').queued).toBe(0)
  })

  it('W2：新请求到达时回收过期 waiter（不依赖后续释放）', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({ maxPaceWaitMs: 10000 })
    g.setLimits('p:llm:m', { maxConcurrent: 1, rpm: 1000, cooldownMs: 1000, retry429: 3 })
    let release
    const gate = new Promise((r) => { release = r })
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { await gate; return 'a' })
    await vi.advanceTimersByTimeAsync(0)
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => 'b')
    const p2Rejected = expect(p2).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await vi.advanceTimersByTimeAsync(31000)
    // p1 仍占用并发；p3 到达时 run() 开头 sweep 先回收过期的 p2
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => 'c')
    await p2Rejected
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(100)
    await p1
    await p3
    expect(g.getStatus('p:llm:m').queued).toBe(0)
  })

  // ─── W3：按 provider 配置化 RPM ────────────────────────
  it('W3：provider 级 rpm 生效（rpm=1000 两次调用错峰极小）', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p', { rpm: 1000, maxConcurrent: 4, cooldownMs: 1000, retry429: 3 })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(1); return 'a' })
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => { calls.push(2); return 'b' })
    await vi.advanceTimersByTimeAsync(100)
    await p1
    await p2
    expect(calls).toEqual([1, 2])
  })

  it('W3：未配置 provider 回退类别默认（llm rpm=30 → 间隔 2s）', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'unknown-provider', model: 'm' }, async () => { calls.push(1); return 'a' })
    const p2 = g.run({ type: 'llm', providerId: 'unknown-provider', model: 'm' }, async () => { calls.push(2); return 'b' })
    await vi.advanceTimersByTimeAsync(0)
    await p1
    expect(calls).toEqual([1])
    await vi.advanceTimersByTimeAsync(2100)
    await p2
    expect(calls).toEqual([1, 2])
  })

  it('W3：构造函数 providerLimits 直接注入生效', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({
      providerLimits: { openai: { rpm: 1000, maxConcurrent: 4, cooldownMs: 1000, retry429: 3 } },
    })
    const calls = []
    const p1 = g.run({ type: 'llm', providerId: 'openai', model: 'm' }, async () => { calls.push(1); return 'a' })
    const p2 = g.run({ type: 'llm', providerId: 'openai', model: 'm' }, async () => { calls.push(2); return 'b' })
    await vi.advanceTimersByTimeAsync(100)
    await p1
    await p2
    expect(calls).toEqual([1, 2])
  })
})

  it('requests 字段窗口按请求次数计数（5 小时限额次数，无 usage 也累计）', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 1000, retry429: 3 })
    g.setTokenWindows('p:llm:m', [{ windowMs: 5 * 3600 * 1000, limit: 3, field: 'requests' }])
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a1 = expect(p1).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a1
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a2 = expect(p2).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a2
    // 第 3 次调用：3 次限额用完（used=3，第 limit 次允许成功）→ 第 4 次起预检拒绝
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a3 = expect(p3).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a3
    const p4 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a4 = expect(p4).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await vi.advanceTimersByTimeAsync(200)
    await a4
  })

  it('provider 级 5h 请求窗口（setProviderTokenWindows）跨 type:model key 共享计数', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 1000, retry429: 3 })
    // 与 ModelProviderManager._applyGovernorLimits 相同的注入方式（providerId 级）
    // 窗口语义：第 limit 次允许成功，第 limit+1 个起预检拒绝（2026-08-12 与模拟器 preflight 语义对齐）
    g.setProviderTokenWindows('p', [{ windowMs: 5 * 3600 * 1000, limit: 3, field: 'requests' }])
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a1 = expect(p1).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a1
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm2' }, async () => ({ ok: true }))
    const a2 = expect(p2).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a2
    // 第 3 次（不同 model key 也命中 provider 级共享窗口）：第 limit 次允许成功
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm3' }, async () => ({ ok: true }))
    const a3 = expect(p3).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a3
    // 第 4 次（超过 limit）→ QUOTA_EXCEEDED
    const p4 = g.run({ type: 'llm', providerId: 'p', model: 'm4' }, async () => ({ ok: true }))
    const a4 = expect(p4).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await vi.advanceTimersByTimeAsync(200)
    await a4
  })

  it('清除 provider 级窗口（传 []）后不再拦截', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 2, rpm: 1000, retry429: 3 })
    g.setProviderTokenWindows('p', [{ windowMs: 5 * 3600 * 1000, limit: 1, field: 'requests' }])
    // 第 1 次：limit=1 允许成功（第 limit 次）
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a1 = expect(p1).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a1
    // 第 2 次：used=1 >= 1 → 预检拒绝
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a2 = expect(p2).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await vi.advanceTimersByTimeAsync(200)
    await a2
    // 清除后第 3 次放行
    g.setProviderTokenWindows('p', [])
    const p3 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => ({ ok: true }))
    const a3 = expect(p3).resolves.toMatchObject({ ok: true })
    await vi.advanceTimersByTimeAsync(200)
    await a3
  })

  it('同 key 嵌套 run 重入透传：外层持有时内层直接执行，不自死锁（2026-08-10 双包死锁复盘）', async () => {
    // 生产形状：story2video-stages 外层 withModelBudget → governor.run，AIGenerator.generate 内层
    // governor.run（同一单例、同一 key）。修复前内层排队等外层占满的信号量 → 永久死锁。
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p', { rpm: 100000, maxConcurrent: 2, cooldownMs: 1000, retry429: 3 })
    const calls = []
    const outerTask = async () => {
      calls.push('outer-enter')
      const inner = await g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
        calls.push('inner')
        return 'inner-ok'
      })
      calls.push('outer-exit')
      return inner
    }
    const p1 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, outerTask)
    const p2 = g.run({ type: 'llm', providerId: 'p', model: 'm' }, outerTask)
    const result = await Promise.race([
      Promise.all([p1, p2]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('同 key 嵌套 run 死锁：内层排队等待外层占用的信号量，永不释放')), 5000)),
    ])
    expect(result).toEqual(['inner-ok', 'inner-ok'])
    expect(calls.filter((c) => c === 'inner')).toHaveLength(2)
    // 内层透传不重复占槽：结束后并发/排队均归零
    expect(g.getStatus('p:llm:m').active).toBe(0)
    expect(g.getStatus('p:llm:m').queued).toBe(0)
  })

  it('同 key 重入只占一个并发槽（maxConcurrent=1 也不会自锁），不同 key 嵌套仍独立调度', async () => {
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p', { rpm: 100000, maxConcurrent: 1, cooldownMs: 1000, retry429: 3 })
    const calls = []
    // 同 key 双层 run：maxConcurrent=1 时若内层不重入透传，单次请求就会自锁
    const sameKeyTask = async () => {
      calls.push('outer')
      const r = await g.run({ type: 'llm', providerId: 'p', model: 'm' }, async () => {
        calls.push('inner')
        return 'ok'
      })
      return r
    }
    const sameKeyResults = await Promise.race([
      Promise.all([
        g.run({ type: 'llm', providerId: 'p', model: 'm' }, sameKeyTask),
        g.run({ type: 'llm', providerId: 'p', model: 'm' }, sameKeyTask),
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('maxConcurrent=1 同 key 双层 run 自锁')), 5000)),
    ])
    expect(sameKeyResults).toEqual(['ok', 'ok'])
    expect(calls.filter((c) => c === 'inner')).toHaveLength(2)

    // 不同 key 嵌套：tts key 不在 llm key 的持有集合内 → 仍走独立信号量，不误判为重入
    const differentKeyTask = async () => {
      return g.run({ type: 'tts', providerId: 'p', model: 'v' }, async () => 'tts-ok')
    }
    const differentKeyResults = await Promise.race([
      Promise.all([
        g.run({ type: 'llm', providerId: 'p', model: 'm' }, differentKeyTask),
        g.run({ type: 'llm', providerId: 'p', model: 'm' }, differentKeyTask),
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('不同 key 嵌套被误判为重入或排队死锁')), 5000)),
    ])
    expect(differentKeyResults).toEqual(['tts-ok', 'tts-ok'])
    expect(g.getStatus('p:llm:m').active).toBe(0)
    expect(g.getStatus('p:tts:v').active).toBe(0)
  })

describe('P1 调度可观测性（排队/冷却计数）', () => {
  it('排队被记录且快照取走即清零', async () => {
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p1', { rpm: 120, maxConcurrent: 1 })
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const task = async () => { await sleep(60); return { ok: true } }
    // maxConcurrent=1：第二个请求在并发信号量排队等待第一个完成（约 60ms）
    await Promise.all([
      g.run({ type: 'llm', providerId: 'p1', model: '' }, task),
      g.run({ type: 'llm', providerId: 'p1', model: '' }, task),
    ])
    const snap = g.takeObservabilitySnapshot()
    expect(snap.p1).toBeTruthy()
    expect(snap.p1.queuedCount).toBeGreaterThan(0)
    expect(snap.p1.queueWaitMs).toBeGreaterThan(0)
    expect(g.takeObservabilitySnapshot()).toEqual({})
  })

  it('429 冷却等待被记录', async () => {
    const g = new ApiUsageGovernor({})
    // rpm=600 → pace 间隔 100ms；cooldownMs=300 保证第二次请求在冷却窗口内等待
    g.setProviderLimits('p2', { rpm: 600, maxConcurrent: 2, cooldownMs: 300, retry429: 1 })
    const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')
    let calls = 0
    const task = async () => {
      calls += 1
      if (calls === 1) throw new ProviderError(ERROR_CODES.RATE_LIMITED, 'rate limited', { providerId: 'p2' })
      return { ok: true }
    }
    // 第一次：429 → 进入冷却（cooldown_until = now + 300ms）
    await expect(g.run({ type: 'llm', providerId: 'p2', model: '' }, task)).rejects.toThrow()
    // 第二次：在冷却窗口内立即发起 → 等待冷却
    await g.run({ type: 'llm', providerId: 'p2', model: '' }, task)
    const snap = g.takeObservabilitySnapshot()
    expect(snap.p2.cooldownCount).toBeGreaterThan(0)
    expect(snap.p2.cooldownWaitMs).toBeGreaterThan(0)
  })

  it('同 key 重入透传内层不重复计时', async () => {
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p3', { rpm: 120, maxConcurrent: 1 })
    await g.run({ type: 'llm', providerId: 'p3', model: '' }, async () => {
      // 内层同 key 重入 → 透传执行，不进入 _runWithGovernance
      await g.run({ type: 'llm', providerId: 'p3', model: '' }, async () => ({ ok: true }))
      return { ok: true }
    })
    const snap = g.takeObservabilitySnapshot()
    // 单请求无排队；即使有也最多计 1 次（外层），内层不计时
    expect(snap.p3.queuedCount).toBeLessThanOrEqual(1)
  })
})

describe('requests 额度窗口的并发准入原子性（governor-quota-reserve）', () => {
  // 这些用例的存在理由：既有额度测试全部是「await p1; await p2; …」串行构造，
  // 于是 win.used 在每次预检时都已是新鲜的，`maxConcurrent > 1` 下的超额执行从未被观测到。
  // 度量一律取「task 体内自增的执行次数」——它才是「是否真的打了一次 provider」的唯一代理，
  // 只看 g.run 的 resolve/reject 会把「已执行却被事后断言拒」读成「未执行」。
  const META = { type: 'llm', providerId: 'p', model: 'm' }

  const makeGovernor = ({ maxConcurrent, windows, retry429 = 1 }) => {
    const g = new ApiUsageGovernor({})
    // rpm 取大值：把 RPM 时间槽的错峰开销压到 0.6ms，使它不掩盖也不参与本组用例的判定
    g.setLimits('p:llm:m', { maxConcurrent, rpm: 100000, cooldownMs: 1000, retry429 })
    g.setTokenWindows('p:llm:m', windows)
    return g
  }

  const boom = () => {
    const e = new Error('provider 侧非额度错误')
    e.code = 'BOOM'
    return e
  }

  /** 一次并发提交 n 个必然成功的请求，返回（真实执行次数, ok 次数, 额度拒次数） */
  const concurrentSuccess = async ({ g, n }) => {
    let executed = 0
    const codes = []
    const ps = []
    for (let i = 0; i < n; i += 1) {
      ps.push(g.run(META, async () => {
        executed += 1
        // task 内必须 await：否则 4 路在途不会真正重叠，预检会被记账顺序串行化
        await new Promise((r) => { setTimeout(r, 50) })
        return { ok: true }
      }).then(() => codes.push('ok'), (e) => codes.push(e && e.code)))
    }
    const settled = Promise.all(ps)
    await vi.advanceTimersByTimeAsync(10000)
    await settled
    return {
      executed,
      ok: codes.filter((c) => c === 'ok').length,
      quota: codes.filter((c) => c === 'QUOTA_EXCEEDED').length,
    }
  }

  it('并发提交时真实执行次数恰好等于 limit，其余一次都未执行', async () => {
    vi.useFakeTimers()
    const g = makeGovernor({
      maxConcurrent: 4,
      windows: [{ windowMs: 5 * 3600 * 1000, limit: 3, field: 'requests' }],
    })
    const r = await concurrentSuccess({ g, n: 7 })
    expect(r.executed).toBe(3)
    expect(r.ok).toBe(3)
    expect(r.quota).toBe(4)
  })

  it('同参数重复多轮，每轮结果都必须是 limit/limit/n-limit（非确定即 FAIL）', async () => {
    vi.useFakeTimers()
    for (let round = 0; round < 8; round += 1) {
      const g = makeGovernor({
        maxConcurrent: 4,
        windows: [{ windowMs: 5 * 3600 * 1000, limit: 3, field: 'requests' }],
      })
      const r = await concurrentSuccess({ g, n: 7 })
      expect(r, 'round ' + round).toMatchObject({ executed: 3, ok: 3, quota: 4 })
    }
  })

  it('失败的调用归还额度：窗口计的是成功次数，不是已发起次数', async () => {
    vi.useFakeTimers()
    const g = makeGovernor({
      maxConcurrent: 1,
      windows: [{ windowMs: 5 * 3600 * 1000, limit: 2, field: 'requests' }],
    })
    const callOnce = async (task) => {
      const p = g.run(META, task).then(() => 'ok', (e) => e && e.code)
      await vi.advanceTimersByTimeAsync(10000)
      return p
    }
    expect(await callOnce(async () => ({ ok: true }))).toBe('ok')
    expect(await callOnce(async () => { throw boom() })).toBe('BOOM')
    // 上一次失败必须把这次占用还回来，否则第三个成功调用会被误拒
    expect(await callOnce(async () => ({ ok: true }))).toBe('ok')
    expect(await callOnce(async () => ({ ok: true }))).toBe('QUOTA_EXCEEDED')
  })

  it('429 退避重试是同一次调用，窗口只占 1 次', async () => {
    vi.useFakeTimers()
    const g = makeGovernor({
      maxConcurrent: 1,
      retry429: 2,
      windows: [{ windowMs: 5 * 3600 * 1000, limit: 1, field: 'requests' }],
    })
    const callOnce = async (task) => {
      const p = g.run(META, task).then(() => 'ok', (e) => e && e.code)
      await vi.advanceTimersByTimeAsync(30000)
      return p
    }
    let attempts = 0
    expect(await callOnce(async () => {
      attempts += 1
      if (attempts === 1) throw new ProviderError(ERROR_CODES.RATE_LIMITED, '429')
      return { ok: true }
    })).toBe('ok')
    expect(attempts).toBe(2)
    // 若重试被计成两次占用，这第三次断言会提前拿到 QUOTA_EXCEEDED；反过来若把预留挪进
    // 每个 attempt，第二次尝试自己就会被预检拒 → 上一条不再返回 'ok'
    expect(await callOnce(async () => ({ ok: true }))).toBe('QUOTA_EXCEEDED')
  })

  it('窗口换代后，迟到的失败归还不许动新窗口的计数', async () => {
    vi.useFakeTimers()
    const g = makeGovernor({
      maxConcurrent: 2,
      windows: [{ windowMs: 1000, limit: 1, field: 'requests' }],
    })
    let releaseA
    const gateA = new Promise((r) => { releaseA = r })
    let executedB = 0
    // A 被放行后一直挂在 gate 上，跨过一次窗口过期
    const pA = g.run(META, async () => {
      await gateA
      throw boom()
    }).then(() => 'ok', (e) => e && e.code)
    await vi.advanceTimersByTimeAsync(100)
    // 窗口过期换代
    await vi.advanceTimersByTimeAsync(2000)
    // B 落在新窗口里并成功
    const pB = g.run(META, async () => { executedB += 1; return { ok: true } })
      .then(() => 'ok', (e) => e && e.code)
    await vi.advanceTimersByTimeAsync(100)
    expect(await pB).toBe('ok')
    expect(executedB).toBe(1)
    // A 此刻才失败：它的归还只准作用于自己那一代窗口
    releaseA()
    await vi.advanceTimersByTimeAsync(100)
    expect(await pA).toBe('BOOM')
    // 新窗口已被 B 占满 → C 必须被拒。无代次校验的实现会把 B 的计数抹成 0 而放行 C
    const pC = g.run(META, async () => ({ ok: true })).then(() => 'ok', (e) => e && e.code)
    await vi.advanceTimersByTimeAsync(100)
    expect(await pC).toBe('QUOTA_EXCEEDED')
  })

  it('token 计数窗口仍走事后记账：先执行、成本回来才判超额', async () => {
    vi.useFakeTimers()
    const g = makeGovernor({
      maxConcurrent: 1,
      windows: [{ windowMs: 5 * 3600 * 1000, limit: 1000, field: 'total_tokens' }],
    })
    const callOnce = async (task) => {
      const p = g.run(META, task).then(() => 'ok', (e) => e && e.code)
      await vi.advanceTimersByTimeAsync(10000)
      return p
    }
    let executed = 0
    const code = await callOnce(async () => {
      executed += 1
      return { usage: { total_tokens: 2000 } }
    })
    expect(executed).toBe(1)
    expect(code).toBe('QUOTA_EXCEEDED')
    // 事后断言不得对 requests 窗口生效，但这里必须对 token 窗口继续生效
    const g2 = makeGovernor({
      maxConcurrent: 1,
      windows: [{ windowMs: 5 * 3600 * 1000, limit: 1000, field: 'total_tokens' }],
    })
    let executed2 = 0
    const code2 = await g2.run(META, async () => { executed2 += 1; return { usage: { total_tokens: 500 } } })
      .then(() => 'ok', (e) => e && e.code)
    await vi.advanceTimersByTimeAsync(10000)
    expect(code2).toBe('ok')
    expect(executed2).toBe(1)
  })

  it('多窗口部分已满时不得留下半份额预留（准入必须原子）', async () => {
    vi.useFakeTimers()
    const g = new ApiUsageGovernor({})
    g.setLimits('p:llm:m', { maxConcurrent: 1, rpm: 100000, cooldownMs: 1000, retry429: 1 })
    // 宽窗 10 + 紧窗 1：从第 2 个请求起必然在**第二个**窗口被判满。若准入是边检查边 +1，
    // 第一个窗口就会被一次次「失败准入」白吃额度（变异实测 used 涨到 4）。
    g.setTokenWindows('p:llm:m', [
      { windowMs: 5 * 3600 * 1000, limit: 10, field: 'requests' },
      { windowMs: 5 * 3600 * 1000, limit: 1, field: 'requests' },
    ])
    const callOnce = async () => {
      const p = g.run(META, async () => ({ ok: true })).then(() => 'ok', (e) => e && e.code)
      await vi.advanceTimersByTimeAsync(10000)
      return p
    }
    expect(await callOnce()).toBe('ok')
    expect(await callOnce()).toBe('QUOTA_EXCEEDED')
    expect(await callOnce()).toBe('QUOTA_EXCEEDED')
    expect(await callOnce()).toBe('QUOTA_EXCEEDED')
    // 这里读内部窗口状态：泄漏不体现在「本次调用成功/失败」上（紧窗本来就一直在拒），
    // 公开 API 在不人为改配置的前提下观测不到，故直接断言计数本身。
    const ws = g._usageWindows('p:llm:m', g._stateFor('p:llm:m'))
    expect(ws.map((w) => w.used)).toEqual([1, 1])
  })

  it('provider 级共享窗口在多 model key 并发下同样不超支', async () => {
    vi.useFakeTimers()
    // 生产路径是 providerId 级注入（见 model-provider-manager._applyGovernorLimits）：
    // 额度窗口跨 type:model key 共享，而并发信号量按 key 各自独立 —— 这是另一种形状。
    const g = new ApiUsageGovernor({})
    g.setProviderLimits('p', { maxConcurrent: 4, rpm: 100000, cooldownMs: 1000, retry429: 1 })
    g.setProviderTokenWindows('p', [{ windowMs: 5 * 3600 * 1000, limit: 3, field: 'requests' }])
    let executed = 0
    const codes = []
    const ps = []
    for (let i = 0; i < 8; i += 1) {
      const model = 'm' + (i % 3)
      ps.push(g.run({ type: 'llm', providerId: 'p', model }, async () => {
        executed += 1
        await new Promise((r) => { setTimeout(r, 50) })
        return { ok: true }
      }).then(() => codes.push('ok'), (e) => codes.push(e && e.code)))
    }
    const settled = Promise.all(ps)
    await vi.advanceTimersByTimeAsync(10000)
    await settled
    expect(executed).toBe(3)
    expect(codes.filter((c) => c === 'ok')).toHaveLength(3)
    expect(codes.filter((c) => c === 'QUOTA_EXCEEDED')).toHaveLength(5)
  })

  it('结构锁：requests 窗口的计数只发生在准入这一处', () => {
    // 行为用例能抓到「准入 +1 之外又记账 +1」（'失败的调用归还额度' 会红），
    // 但「事后断言重新对 requests 生效」在当前实现里是行为 no-op，只能靠读源码守住。
    // 这不是用记录性断言代替跑流程——流程已由本 describe 的用例真跑覆盖，这里只钉结构。
    // 锚点一律取**方法定义串**（带 ' {'）：'_reserveTokenBudget(key, st)' 这种写法会先命中
    // _runWithGovernance 里的调用点，切片就会反向。
    const fs = require('node:fs')
    const src = fs.readFileSync(require.resolve('./api-usage-governor.js'), 'utf8')
    const cut = (from, to) => {
      const i = src.indexOf(from)
      const j = src.indexOf(to)
      expect(i, '找不到定义 ' + from).toBeGreaterThan(-1)
      expect(j, '找不到定义 ' + to).toBeGreaterThan(i)
      return src.slice(i, j)
    }
    const record = cut('_recordUsage(key, st, limits, result) {', '_reserveTokenBudget(key, st) {')
    expect(record).toMatch(/if \(win\.field === 'requests'\) continue/)
    const reserve = cut('_reserveTokenBudget(key, st) {', '_releaseTokenBudget(reservations) {')
    expect(reserve).toMatch(/baseUsed >= win\.limit\) throw this\._quotaExceeded/)
    expect(reserve).toMatch(/win\.used \+= 1/)
    // 准入必须「先全部判定、再统一提交」：两阶段各有容器，且提交段位于所有 throw 之后。
    // 逐窗口边检查边 +1 会让后一个窗口判满时，前一个窗口的预留永久泄漏
    // （调用方的归还只覆盖 _executeWithRetry 失败，而那时凭据还没返回）。
    expect(reserve).toMatch(/const plans = \[\]/)
    expect(reserve).toMatch(/for \(const plan of plans\)/)
    expect(reserve.indexOf('throw this._quotaExceeded')).toBeLessThan(reserve.indexOf('plan.win.used += 1'))
    const budget = cut('_assertTokenBudget(key, st) {', 'async _executeWithRetry(key, st, limits, task) {')
    expect(budget).toMatch(/if \(win\.field === 'requests'\) continue/)
    // 重试体内不得出现预留：否则每次 attempt 重复占用额度。切片必须覆盖 _executeWithRetry 的
    // **函数体**——只截到函数头的话，这条断言对「把预留挪进重试循环」完全免疫，是自证断言。
    const retry = cut('async _executeWithRetry(key, st, limits, task) {', 'module.exports')
    expect(retry).not.toMatch(/_reserveTokenBudget/)
    const governance = cut('const reservations = this._reserveTokenBudget(key, st)', 'st.active -= 1')
    expect(governance).toMatch(/catch \(err\)/)
    expect(governance).toMatch(/this\._releaseTokenBudget\(reservations\)/)
  })
})
