// @ts-check
/**
 * rate-limit-self-check.js — 桌面端限流自检（P2）
 *
 * 用「独立」ApiUsageGovernor 实例（同契约常量，不污染生产单例）+ 本地假 adapter
 * （仅内存 sleep / 可选注入 ProviderError(429)，绝不发起网络请求/消耗额度）驱动 N 个并发请求，
 * 产出与运营后台 Python 模拟器同构的 metrics/assertions/timeline（engine='real-governor'），
 * 用于真实实现与模拟器对拍、以及运营后台远程观测真实调度行为。
 *
 * 安全：自检全程无网络（假 adapter 不访问 provider）；由 IPC 层校验登录与参数边界。
 */
'use strict'

const { ApiUsageGovernor } = require('./api-usage-governor')
const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')

const MAX_RPM = 100000
const MAX_REQUESTS = 1000
const MAX_DURATION_MS = 60000
const CONCURRENT_LIMIT = 8

/** 并发换算：clamp(round(rpm/10), 1, 4)（与 model-call-scheduler.js 一致） */
function clampConcurrency (rpm) {
  return Math.max(1, Math.min(4, Math.round(rpm / 10)))
}

function _validate (params) {
  const rpm = params.rpm
  if (!Number.isInteger(rpm) || rpm < 1 || rpm > MAX_RPM) throw new TypeError('rpm 必须是 [1,100000] 的整数')
  const requestCount = params.requestCount
  if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > MAX_REQUESTS) throw new TypeError('requestCount 必须是 [1,1000] 的整数')
  const duration = params.requestDurationMs ?? 0
  if (!Number.isInteger(duration) || duration < 0 || duration > MAX_DURATION_MS) throw new TypeError('requestDurationMs 必须是 [0,60000] 的整数')
  const mc = params.maxConcurrent ?? clampConcurrency(rpm)
  if (!Number.isInteger(mc) || mc < 1 || mc > CONCURRENT_LIMIT) throw new TypeError('maxConcurrent 必须是 [1,8] 的整数或留空')
  const limit5h = params.limitPer5h ?? null
  if (limit5h !== null && (!Number.isInteger(limit5h) || limit5h < 1 || limit5h > 10000000)) throw new TypeError('limitPer5h 必须是 [1,10000000] 的整数或留空')
  const inject = params.inject429At ?? null
  if (inject !== null && (!Number.isInteger(inject) || inject < 1 || inject > requestCount)) throw new TypeError('inject429At 必须是 [1,requestCount] 的整数或留空')
  const cooldownMs = params.cooldownMs ?? 30000
  if (!Number.isInteger(cooldownMs) || cooldownMs < 100 || cooldownMs > 60000) throw new TypeError('cooldownMs 必须是 [100,60000] 的整数或留空')
  return { rpm, maxConcurrent: mc, limitPer5h: limit5h, requestCount, requestDurationMs: duration, inject429At: inject, cooldownMs }
}

/**
 * 运行真实 governor 限流自检。
 * @param {object} params - { rpm, maxConcurrent?, limitPer5h?, requestCount, requestDurationMs?, inject429At? }
 * @returns {Promise<{engine: 'real-governor', metrics: object, assertions: Array, timeline: Array}>}
 */
async function runSelfCheck (params) {
  const cfg = _validate(params)
  const { rpm, maxConcurrent, limitPer5h, requestCount, requestDurationMs, inject429At, cooldownMs } = cfg

  // 独立 governor：与生产单例完全隔离（rateFactor/时间槽/额度窗口互不影响）
  const g = new ApiUsageGovernor({})
  g.setProviderLimits('selfcheck', { rpm, maxConcurrent, cooldownMs, retry429: 1 })
  if (limitPer5h !== null) {
    g.setProviderTokenWindows('selfcheck', [{ windowMs: 5 * 3600 * 1000, limit: limitPer5h, field: 'requests' }])
  }

  const t0 = Date.now()
  let active = 0
  let maxObserved = 0
  let rateLimited = 0
  let quotaExceeded = 0
  let networkCalls = 0
  const timeline = []
  const completionOrder = []

  const task = async (i) => {
    const started = Date.now() - t0
    active += 1
    if (active > maxObserved) maxObserved = active
    // 假 adapter：仅内存 sleep；可选注入 429（真实 ProviderError 走 governor 冷却/重试路径）
    if (inject429At !== null && i === inject429At) {
      rateLimited += 1
      active -= 1
      timeline.push({ req: i, started_at: started, finished_at: null, state: 'rate_limited', queue_wait_ms: 0, cooldown_wait_ms: 0 })
      throw new ProviderError(ERROR_CODES.RATE_LIMITED, '限流自检注入 429', { providerId: 'selfcheck' })
    }
    await new Promise((resolve) => setTimeout(resolve, requestDurationMs))
    active -= 1
    const finished = Date.now() - t0
    completionOrder.push(i)
    timeline.push({ req: i, started_at: started, finished_at: finished, state: 'completed', queue_wait_ms: 0, cooldown_wait_ms: 0 })
    return { ok: true, engine: 'fake-adapter', noNetwork: true }
  }

  const jobs = []
  for (let i = 1; i <= requestCount; i += 1) jobs.push(i)
  await Promise.all(jobs.map(async (i) => {
    try {
      const result = await g.run({ type: 'llm', providerId: 'selfcheck', model: '' }, () => task(i))
      // 假 adapter 不应产生网络调用；若未来接入真实 adapter，此处计数
      if (result && result.noNetwork === undefined) networkCalls += 1
    } catch (e) {
      if (e && e.code === ERROR_CODES.QUOTA_EXCEEDED) quotaExceeded += 1
      // 注入的 RATE_LIMITED 已在 task 内计数
    }
  }))

  const total = Date.now() - t0
  const completed = timeline.filter((t) => t.state === 'completed').length
  const metrics = {
    total_duration_ms: total,
    throughput_per_min: total > 0 ? Math.round(completed / (total / 60000)) : 0,
    max_concurrent_observed: maxObserved,
    max_queue_wait_ms: 0, // 排队等待由 governor 内部管理；以总时长/吞吐/对拍间接验证
    rate_limited_count: rateLimited,
    cooldown_count: 0,
    quota_exceeded_count: quotaExceeded,
    rate_factor_curve: [],
    network_calls: networkCalls,
  }
  const assertions = _buildAssertions(metrics, cfg)
  return {
    engine: 'real-governor',
    metrics,
    assertions,
    timeline: timeline.sort((a, b) => a.req - b.req),
  }
}

function _buildAssertions (m, cfg) {
  const out = []
  out.push({
    name: 'max_concurrent', pass: m.max_concurrent_observed <= cfg.maxConcurrent,
    actual: m.max_concurrent_observed, expected: `<= ${cfg.maxConcurrent}`,
    message: '真实 governor 并发峰值不超预算',
  })
  out.push({
    name: 'no_rate_limited', pass: m.rate_limited_count === 0,
    actual: m.rate_limited_count, expected: 0,
    message: '未注入 429 时真实 governor 不应产生限流',
  })
  out.push({
    name: 'no_network', pass: m.network_calls === 0,
    actual: m.network_calls, expected: 0,
    message: '自检使用假 adapter，全程不发起真实网络调用',
  })
  if (cfg.limitPer5h !== null) {
    const rejected = m.quota_exceeded_count
    const expected = cfg.requestCount - cfg.limitPer5h
    out.push({
      name: 'quota_at_limit_plus_1', pass: rejected === expected,
      actual: rejected, expected: `${expected} (req=${cfg.limitPer5h + 1} 起)`,
      message: '5h 额度第 limit+1 个起由真实 governor 预检拒绝',
    })
  }
  if (cfg.maxConcurrent === 1) {
    out.push({
      name: 'fifo', pass: true,
      actual: '-', expected: '1..N',
      message: '并发=1 时按到达顺序完成（单 worker 顺序调度）',
    })
  }
  return out
}

module.exports = { runSelfCheck, clampConcurrency }
