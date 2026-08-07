// @ts-check
/**
 * api-usage-governor.js — API 并发控制 / 排队 / 限流 / 重试网关（主进程）
 *
 * 目标：大部分模型 API 有每分钟调用频率限制，且很多用户使用 coding plan / token plan，
 * 不仅有 RPM 限制，还有每 5 小时 / 每周的 token 额度。本模块在 provider 调用统一出口
 * （AIGenerator.generate）之上提供：
 *   - 每 provider 并发信号量（maxConcurrent），超出时排队等待（有界）
 *   - 每 provider 滑动窗口 RPM 限流，超出时排队等待（有界）
 *   - 收到 429 后进入冷却期（cooldownUntil），配合重试退避
 *   - 错误分类：rate（429，冷却+退避重试）/ quota（额度耗尽，不重试，明确提示）/
 *     transient（超时/网络，短退避重试）/ content_policy / other（不重试）
 *   - 可选 token 额度窗口（5h / 周），按 usage 累计，超限立即拒绝并给出明确原因
 *   - 429 自适应：限流后按 0.75 系数下调本 provider 的 RPM 预算，成功后缓慢恢复
 */
'use strict'

const { ProviderError, ERROR_CODES, classifyProviderFailure } = require('./adapters/_base/provider-error')

const WINDOW_MS = 60 * 1000
const MAX_QUEUE_WAIT_MS = 30 * 1000
const MAX_PACE_WAIT_MS = 180 * 1000
const MAX_COOLDOWN_WAIT_MS = 45 * 1000
const TRANSIENT_RETRIES = 2
const RATE_ADAPT_FACTOR = 0.75
const RATE_RECOVER_STEP = 0.05

const DEFAULT_LIMITS = Object.freeze({
  llm: Object.freeze({ rpm: 30, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  tts: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  image: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  video: Object.freeze({ rpm: 4, maxConcurrent: 1, cooldownMs: 60000, retry429: 2 }),
  audio: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  default: Object.freeze({ rpm: 20, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))

function jitter(baseMs) {
  return baseMs + Math.round(Math.random() * 1500)
}

function retryAfterMs(error) {
  const raw = error?.context?.retryAfter ?? error?.response?.headers?.['retry-after']
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  return 0
}

class ApiUsageGovernor {
  constructor(options = {}) {
    this._enabled = options.enabled !== false
    this._log = options.log || { warn() {}, info() {} }
    this._limits = new Map() // key -> limits（精确 key 覆盖）
    this._providerLimits = new Map() // providerId -> limits（W3：按 provider 配置化）
    this._tokenWindows = new Map() // key -> [{ windowMs, limit, field }]
    this._state = new Map() // key -> { active, waiters, nextSlotAt, cooldownUntil, rateFactor, tokenWindows }
    this._maxPaceWaitMs = Number.isFinite(Number(options.maxPaceWaitMs)) && Number(options.maxPaceWaitMs) > 0
      ? Number(options.maxPaceWaitMs)
      : MAX_PACE_WAIT_MS
    if (options.providerLimits && typeof options.providerLimits === 'object') {
      for (const [providerId, limits] of Object.entries(options.providerLimits)) {
        if (limits && typeof limits === 'object') this._providerLimits.set(providerId, { ...limits })
      }
    }
  }

  setEnabled(enabled) {
    this._enabled = enabled !== false
  }

  setLimits(key, limits) {
    const base = this._limits.get(key) || {}
    this._limits.set(key, { ...base, ...limits })
  }

  /** W3：按 providerId 设置限流预算（如 openai / minimax-tts / flux），
   *  优先级低于精确 key 覆盖，高于类别默认值。 */
  setProviderLimits(providerId, limits) {
    const base = this._providerLimits.get(providerId) || {}
    this._providerLimits.set(providerId, { ...base, ...limits })
  }

  setTokenWindows(key, windows) {
    if (!Array.isArray(windows)) return
    this._tokenWindows.set(key, windows.map((w) => ({ ...w })))
  }

  _limitsFor(key, type, providerId) {
    if (this._limits.has(key)) return this._limits.get(key)
    if (providerId && this._providerLimits.has(providerId)) return this._providerLimits.get(providerId)
    return DEFAULT_LIMITS[type] || DEFAULT_LIMITS.default
  }

  _stateFor(key) {
    let st = this._state.get(key)
    if (!st) {
      st = { active: 0, waiters: [], nextSlotAt: 0, cooldownUntil: 0, rateFactor: 1, tokenWindows: null }
      this._state.set(key, st)
    }
    return st
  }

  /** 诊断：当前 key 的并发/排队/冷却/预算状态（不含密钥） */
  getStatus(key) {
    const st = this._state.get(key)
    if (!st) return { key, active: 0, queued: 0, inCooldown: false, rateFactor: 1 }
    return {
      key,
      active: st.active,
      queued: st.waiters.length,
      inCooldown: st.cooldownUntil > Date.now(),
      cooldownRemainingMs: Math.max(0, st.cooldownUntil - Date.now()),
      rateFactor: st.rateFactor,
      nextSlotAt: st.nextSlotAt || 0,
    }
  }

  /**
   * 执行受管 provider 调用。
   * @param {{type?: string, providerId?: string, model?: string}} meta
   * @param {() => Promise<any>} task
   * @returns {Promise<any>}
   */
  async run(meta, task) {
    if (!this._enabled) return task()
    const type = String(meta?.type || 'default')
    const providerId = String(meta?.providerId || 'default')
    const model = typeof meta?.model === 'string' && meta.model.trim() ? ':' + meta.model.trim() : ''
    const key = providerId + ':' + type + model
    const limits = this._limitsFor(key, type, providerId)
    const st = this._stateFor(key)

    // W2：每次请求先回收该 key 已过截止时间的排队 waiter（不依赖后续释放）
    this._sweepExpired(key, st)
    await this._acquireSlot(key, st, limits)
    try {
      await this._pace(key, st, limits)
      await this._waitCooldown(key, st, limits)
      return await this._executeWithRetry(key, st, limits, task)
    } finally {
      st.active -= 1
      this._pump(key, st)
    }
  }

  _pump(key, st) {
    this._sweepExpired(key, st)
    while (st.waiters.length > 0) {
      const waiter = st.waiters[0]
      if (st.active < (this._limitsFor(key, '', '').maxConcurrent || 1)) {
        st.waiters.shift()
        waiter.resolve()
      }
      break
    }
  }

  /** W2：回收 key 下所有已过截止时间的排队 waiter（即使没有后续释放也会被清理） */
  _sweepExpired(key, st) {
    const now = Date.now()
    let index = 0
    while (index < st.waiters.length) {
      const waiter = st.waiters[index]
      if (waiter.deadline <= now) {
        st.waiters.splice(index, 1)
        waiter.reject(new ProviderError(ERROR_CODES.RATE_LIMITED, '排队等待超时，请稍后重试。', { providerId: key }))
        continue
      }
      index += 1
    }
  }

  /** W2：统一回收所有 key 的过期 waiter（流水线 run 结束时调用，防止残留排队悬挂） */
  sweepAll() {
    for (const [key, st] of this._state) {
      this._sweepExpired(key, st)
    }
  }

  _acquireSlot(key, st, limits) {
    return new Promise((resolve, reject) => {
      if (st.active < limits.maxConcurrent) {
        st.active += 1
        resolve()
        return
      }
      st.waiters.push({ resolve, reject, deadline: Date.now() + MAX_QUEUE_WAIT_MS })
    })
  }

  _effectiveRpm(st, limits) {
    return Math.max(2, Math.round(limits.rpm * st.rateFactor))
  }

  /**
   * 按时间槽排队：每个请求预约下一个可用时间槽（每 60s 最多 rpm 个槽）。
   * 排队等待有界（默认 3 分钟）；超预算给出明确限流提示，由上层重试/断点恢复处理。
   * 长文案多场景（如 14+ 场景 TTS）时请求自动错峰，而不是在突发后直接失败。
   */
  async _pace(key, st, limits) {
    const now = Date.now()
    const rpm = this._effectiveRpm(st, limits)
    const intervalMs = WINDOW_MS / rpm
    // 同步预约时间槽：并发请求各自拿到不同槽位（先到先得），避免读到同一槽
    const base = Math.max(now, st.nextSlotAt || now)
    st.nextSlotAt = base + intervalMs
    const waitMs = base - now
    if (waitMs > this._maxPaceWaitMs) {
      throw new ProviderError(
        ERROR_CODES.RATE_LIMITED,
        '当前请求频率已达上限，请稍后再试。',
        { providerId: key, cooldownMs: waitMs },
      )
    }
    if (waitMs > 0) await sleep(waitMs)
  }

  async _waitCooldown(key, st, limits) {
    const remaining = st.cooldownUntil - Date.now()
    if (remaining <= 0) return
    if (remaining > MAX_COOLDOWN_WAIT_MS) {
      throw new ProviderError(
        ERROR_CODES.RATE_LIMITED,
        '该模型 API 处于限流冷却期，请稍等约 ' + Math.ceil(remaining / 1000) + ' 秒后重试。',
        { providerId: key, cooldownMs: remaining },
      )
    }
    await sleep(remaining)
  }

  _recordUsage(key, st, limits, result) {
    const windows = this._tokenWindows.get(key)
    if (!windows || !result || typeof result !== 'object') return
    const usage = result.usage || result.data?.usage
    if (!usage || typeof usage !== 'object') return
    const now = Date.now()
    st.tokenWindows = st.tokenWindows || windows.map((w) => ({ ...w, used: 0, startedAt: now }))
    for (const win of st.tokenWindows) {
      if (now - win.startedAt >= win.windowMs) {
        win.used = 0
        win.startedAt = now
      }
      const delta = Number(usage[win.field] ?? usage.total_tokens ?? 0)
      win.used += Number.isFinite(delta) ? delta : 0
    }
  }

  _assertTokenBudget(key, st) {
    const windows = st.tokenWindows
    if (!windows) return
    const now = Date.now()
    for (const win of windows) {
      if (now - win.startedAt >= win.windowMs) {
        win.used = 0
        win.startedAt = now
        continue
      }
      if (win.used >= win.limit) {
        const label = win.windowMs >= 7 * 24 * 3600 * 1000 ? '每周' : (win.windowMs >= 3600 * 1000 ? '每 5 小时' : '当前周期')
        throw new ProviderError(
          ERROR_CODES.QUOTA_EXCEEDED,
          '该模型 API 的' + label + ' token 额度（' + win.limit + '）已用完，请检查套餐额度或更换模型后再试。',
          { providerId: key },
        )
      }
    }
  }

  async _executeWithRetry(key, st, limits, task) {
    let lastError = null
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await task()
        this._recordUsage(key, st, limits, result)
        this._assertTokenBudget(key, st)
        if (st.rateFactor < 1) st.rateFactor = Math.min(1, st.rateFactor + RATE_RECOVER_STEP)
        return result
      } catch (error) {
        lastError = error
        const cls = classifyProviderFailure(error)
        if (cls === 'rate') {
          const cooldown = retryAfterMs(error) || limits.cooldownMs
          st.cooldownUntil = Date.now() + cooldown
          st.rateFactor = Math.max(0.2, st.rateFactor * RATE_ADAPT_FACTOR)
          if (attempt >= limits.retry429) throw error
          await sleep(jitter(cooldown / 3) * attempt)
          continue
        }
        if (cls === 'transient') {
          if (attempt >= TRANSIENT_RETRIES) throw error
          await sleep(500 * attempt)
          continue
        }
        throw error
      }
    }
  }
}

module.exports = { ApiUsageGovernor, DEFAULT_LIMITS }

