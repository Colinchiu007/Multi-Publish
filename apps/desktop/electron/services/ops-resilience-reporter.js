// @ts-check
/**
 * ops-resilience-reporter.js — 断连降级遥测队列 + 配置生效回执（主进程）
 *
 * 为什么单独成文件（2026-10-07，ops-center-resilience）：
 *   ops-center-sync.js 已在 max-lines 债务清单（基线 570 / 允许 +200），本模块承担
 *   「上报侧」全部逻辑，ops-center-sync 只留两行调用。
 *
 * 两条数据通路（design §2 / §3）：
 *   1) ACK   POST /api/v1/runtime/ack         —— 证明「配置真的生效了」的唯一数据源
 *   2) 降级  POST /api/v1/telemetry/degradation —— 断连恢复后补报一次（断连期间不可能上报）
 *
 * 三条不可放松的取舍：
 *   - 遥测不依赖被监控的同一通道：断连期间只写 settings 本地队列，零网络请求；
 *   - 上报失败保留队列（对齐既有「水印仅成功时推进」范式），宁可重复不丢数据；
 *   - 客户端侧先做一遍载荷校验再发，绝不把服务端会 400 的脏数据投出去（看板是唯一证据源）。
 */
'use strict'

const { RUNTIME_BLOCKS } = require('./ops-runtime-snapshot')

/** 降级事件本地队列的 settings 键（复用 settings 表，不新建 SQLite 表 — design §3.5） */
const DEGRADATION_SETTING_KEY = 'opsCenterDegradationQueue'
/** 最近一次 ACK 的 settings 键（config_hash 比对 + 24h 心跳判据的持久化位置） */
const ACK_SETTING_KEY = 'opsCenterRuntimeAck'

const MAX_DEGRADATION_QUEUE = 200
const MAX_EVENT_BYTES = 8 * 1024
const SYNC_TIMEOUT_MS = 10 * 1000

const ENDPOINT_DEGRADATION = '/api/v1/telemetry/degradation'
const ENDPOINT_ACK = '/api/v1/runtime/ack'
const RUNTIME_ENDPOINT = '/api/v1/runtime/bootstrap'

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * 失败分类：把既有同步链路的异常映射到契约白名单。
 * 顺序有讲究：先看显式标记（调用点最清楚），再看错误码（网络层最可靠），
 * 最后才退化到文案匹配 —— 文案是本仓自己写的，跨端/跨版本最易漂移，只当兜底。
 */
function classifyFailureKind (error) {
  if (!error) return 'network'
  if (isPlainObject(error.failureKind) || typeof error.failureKind === 'string') return error.failureKind
  const cause = isPlainObject(error.cause) ? error.cause : {}
  const code = String(error.code || cause.code || '')
  if (code === 'ABORT_ERR' || error.name === 'AbortError') return 'timeout'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns'
  const text = String((error && error.message) || error)
  if (/超时|timeout/i.test(text)) return 'timeout'
  if (/401|403|API Key 无效|凭证/i.test(text)) return 'auth_failed'
  if (/验签失败|签名|SIGNATURE/i.test(text)) return 'verify_failed'
  if (/结构错误|不是合法 JSON|格式无效|响应无效/.test(text)) return 'invalid_payload'
  const http5 = text.match(/HTTP (\d{3})/)
  if (http5) return http5[1].startsWith('5') ? 'http_5xx' : 'http_4xx'
  return 'network'
}

/** 给既有链路抛出的错误挂上 failureKind（不吞原始错误，cause 保留栈） */
function tagOpsError (error) {
  if (!error || typeof error !== 'object') return { message: String(error), cause: error, failureKind: classifyFailureKind(error) }
  if (error.failureKind) return error
  try {
    error.failureKind = classifyFailureKind(error)
    return error
  } catch (_) {
    return { message: String((error && error.message) || error), cause: error, failureKind: 'network' }
  }
}

// 载荷构造 / 校验 / 频率控制 / 身份与鉴权解析已下沉到 ops-resilience-protocol.js：
// 本文件只管「什么时候发、发给谁、失败怎么办」。两者正交，混在一起会让两个轴各自变难测，
// 且本文件已逼近 max-lines 门禁（CI 按 LF 计 500 行）。
const { ACK_HEARTBEAT_INTERVAL_MS, decideAck, isIsoish, resolveClientIdentity, resolveResilienceAuth, summarizeAppliedBlocks, validateAckPayload, validateDegradationPayload, DEGRADATION_TIERS, ACK_TYPES, FAILURE_KINDS, CHANNELS } = require('./ops-resilience-protocol')


class OpsResilienceReporter {
  constructor ({ store, log, fetcher, getAuth, getClientId, getClientVersion, now } = {}) {
    this._store = store
    this._log = log || { info () {}, warn () {}, error () {}, notify () {} }
    this._fetcher = typeof fetcher === 'function' ? fetcher : null
    this._getAuth = typeof getAuth === 'function' ? getAuth : () => null
    // client_id 默认自算：调用方不注入也能上报（少一处必须接线的地方 = 少一类忘接线的 bug）
    const identity = resolveClientIdentity()
    this._getClientId = typeof getClientId === 'function' ? getClientId : () => identity.clientId
    this._getClientVersion = typeof getClientVersion === 'function' ? getClientVersion : () => identity.clientVersion
    this._now = typeof now === 'function' ? now : () => Date.now()
  }

  _notify (event, params, level) {
    if (this._log && typeof this._log.notify === 'function') {
      this._log.notify('OpsResilienceReporter', event, Object.assign({ level: level || 'WARN' }, params || {}))
    }
  }

  _read (key) {
    if (!this._store || typeof this._store.getSettingObject !== 'function') return {}
    try {
      const value = this._store.getSettingObject(key, {})
      return isPlainObject(value) ? value : {}
    } catch (e) {
      this._notify('setting-read-failed', { key, error: String((e && e.message) || e) })
      return {}
    }
  }

  _write (key, value) {
    if (!this._store || typeof this._store.setSetting !== 'function') return false
    try { this._store.setSetting(key, value); return true } catch (e) {
      this._notify('setting-persist-failed', { key, error: String((e && e.message) || e) })
      return false
    }
  }

  _queue () {
    const record = this._read(DEGRADATION_SETTING_KEY)
    return { events: Array.isArray(record.events) ? record.events : [], open: isPlainObject(record.open) ? record.open : null }
  }

  _saveQueue (state) {
    return this._write(DEGRADATION_SETTING_KEY, state)
  }

  _clientVersion () {
    const version = String(this._getClientVersion() || '').slice(0, 32)
    return version || null
  }

  /** 鉴权头：catalog key 或 bearer JWT（零配置化自动发现走 bearer），都没有则返回 null */
  async _authHeaders (auth) {
    if (!auth || !auth.url) return null
    if (auth.getAccessToken) {
      const token = await auth.getAccessToken()
      if (!token) return null
      return { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token }
    }
    if (!auth.apiKey) return null
    return { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Catalog-Key': auth.apiKey }
  }

  async _postJson (auth, endpoint, body) {
    const headers = await this._authHeaders(auth)
    // 两个「没发出去」的原因必须分开报：no-fetcher 是**接线漏了**（生产不该出现，
    // 一旦出现说明上报链路整条断了），no-headers 是**此刻拿不到凭证**（可恢复）。
    // 合成一个信号会让前者被当成后者的常态而长期不修。
    if (!this._fetcher) return { code: 0, skipped: true, reason: 'no-fetcher' }
    if (!headers) return { code: 0, skipped: true, reason: 'no-headers' }
    const base = String(auth.url).replace(/\/+$/, '')
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null
    try {
      const resp = await this._fetcher(base + endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller && controller.signal,
      })
      if (!resp || resp.ok !== true) return { code: -1, message: 'HTTP ' + (resp && resp.status) }
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: String((e && e.message) || e) }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * 记一次失败。首次失败开一集断连并**立刻落盘**（断连期间不可能上报，事件必须先在本地），
   * 后续失败只更新本集计数与失败类型，不追加条目 —— 队列回答的是「断了几次、断了多久」。
   */
  recordFailure ({ channel = 'runtime', endpoint = RUNTIME_ENDPOINT, failureKind, servingTier = 'default', now } = {}) {
    if (!this._store || typeof this._store.setSetting !== 'function') return false
    const kind = FAILURE_KINDS.includes(failureKind) ? failureKind : 'network'
    const tier = DEGRADATION_TIERS.includes(servingTier) ? servingTier : 'default'
    const at = Number.isFinite(Number(now)) ? Number(now) : this._now()
    const state = this._queue()
    let event = state.open ? state.events.find((e) => isPlainObject(e) && e.id === state.open.id) || null : null
    if (!event) {
      event = {
        id: 'deg-' + at + '-' + state.events.length,
        client_id: String(this._getClientId() || '').slice(0, 64),
        client_version: this._clientVersion(),
        channel: CHANNELS.includes(channel) ? channel : 'runtime',
        endpoint: String(endpoint || RUNTIME_ENDPOINT).slice(0, 200),
        failure_kind: kind,
        consecutive_failures: 1,
        degraded_since: new Date(at).toISOString(),
        recovered_at: null,
        offline_seconds: 0,
        serving_tier: tier,
      }
      state.events.push(event)
      state.open = { id: event.id }
    } else {
      event.consecutive_failures = (Number(event.consecutive_failures) || 0) + 1
      event.failure_kind = kind
    }
    // 单条 8KB 上限：异常 payload 不入队（宁可少一条，也不用一条脏数据撑爆 settings）
    const text = JSON.stringify(event)
    if (Buffer.byteLength(text, 'utf8') > MAX_EVENT_BYTES) {
      this._notify('degradation-event-dropped', { reason: 'over-8kb' })
      return false
    }
    if (state.events.length > MAX_DEGRADATION_QUEUE) {
      const overflow = state.events.length - MAX_DEGRADATION_QUEUE
      state.events.splice(0, overflow) // 降级事件有天然时效性，丢最旧
      this._notify('degradation-queue-trimmed', { dropped: overflow })
    }
    return this._saveQueue(state)
  }

  /**
   * 关闭本轮断连：标记恢复时刻与断连时长，但**保留 open 标记** ——
   * 补报失败时事件仍要留在队列里等下轮重试（design §3.5「失败保留」）。
   * 只有投递成功才出队并清 open。
   */
  _markRecovered (state, tier, at) {
    if (!state.open) return null
    const event = state.events.find((e) => isPlainObject(e) && e.id === state.open.id)
    if (!event) { state.open = null; return null }
    const started = Date.parse(String(event.degraded_since || ''))
    event.recovered_at = new Date(at).toISOString()
    event.offline_seconds = Number.isFinite(started) ? Math.max(0, Math.round((at - started) / 1000)) : 0
    event.serving_tier = DEGRADATION_TIERS.includes(tier) ? tier : 'default'
    return event
  }

  /**
   * 断连恢复后集中补报本轮降级事件。失败保留队列（design §3.5「失败保留，下轮再试」），
   * 成功才出队；这样「上报失败」不会把唯一的断连证据丢掉。
   */
  async reportRecovered ({ servingTier = 'L1', now } = {}) {
    const auth = this._getAuth()
    if (!auth || !auth.url) return { code: 0, skipped: true }
    const state = this._queue()
    const at = Number.isFinite(Number(now)) ? Number(now) : this._now()
    const event = this._markRecovered(state, servingTier, at)
    if (!event) return { code: 0, reported: 0 }
    this._saveQueue(state)
    const errors = validateDegradationPayload(event)
    if (errors.length) {
      this._notify('degradation-payload-invalid', { errors })
      return { code: -1, message: 'invalid-payload: ' + errors.join(',') }
    }
    const result = await this._postJson(auth, ENDPOINT_DEGRADATION, event)
    // skipped ≠ 成功：skipped 意味着「根本没发出去」（无 fetcher / 无鉴权头）。
    // 若与 code 0 同等对待，队列里这条唯一的断连证据会被**永久删除**而服务端从未收到，
    // 直接违反「上报失败保留队列，宁可重复不丢数据」。
    if (result.skipped) {
      this._notify('degradation-report-skipped', { endpoint: ENDPOINT_DEGRADATION, reason: result.reason || 'no-transport' })
      return { code: 0, reported: 0, skipped: true }
    }
    if (result.code !== 0) {
      this._notify('degradation-report-failed', { message: result.message })
      return { code: -1, message: result.message }
    }
    this._write(DEGRADATION_SETTING_KEY, {
      events: this._queue().events.filter((e) => isPlainObject(e) && e.id !== event.id),
      open: null,
    })
    // 回传降级起点：recordApplied 紧接着要发 degraded=true 的 ACK，
    // 队列此时已被清空，不回传就只能拿到恢复时刻。
    return { code: 0, reported: 1, offlineSeconds: event.offline_seconds, degradedSince: event.degraded_since || null }
  }

  /**
   * 一次成功应用运行时策略后的统一出口：先补报本轮断连，再按 hash 判据决定是否 ACK。
   * 返回值给调用方做日志；任何失败都不抛 —— 上报失败不该影响「配置已生效」这个事实。
   */
  async recordApplied ({ payload, servingTier = 'L1', now } = {}) {
    const degradedBefore = Boolean(this._queue().open)
    const recovered = degradedBefore
    let reported = { code: 0, reported: 0 }
    if (recovered) reported = await this.reportRecovered({ servingTier, now })
    const ack = await this.maybeSendAck({
      // degradedSince 取自本轮被标记恢复的那条事件（reportRecovered 回传），
      // 不能在它清空队列之后再回头读 —— 读到 null 时 maybeSendAck 会退化成
      // 「用恢复时刻当降级起点」，服务端拿到的断连起点是错的。
      payload,
      degraded: recovered,
      degradedSince: recovered ? (reported.degradedSince || this._readLastDegradedSince()) : null,
      servingTier,
      now,
    })
    return Object.assign({ reported: reported.reported || 0 }, ack)
  }

  /** 本轮断连的起点（补报成功后队列已清空，ACK 载荷仍要带上断连起点） */
  _readLastDegradedSince () {
    const state = this._queue()
    return state.events.length ? state.events[state.events.length - 1].degraded_since || null : null
  }

  /**
   * 按 config_hash 比对 + 24h 心跳判据决定是否上报 ACK，并记录本次 ACK 状态。
   * 只有投递成功才推进记录：失败时下一轮仍会重试（hash 相同但无记录 → applied）。
   */
  async maybeSendAck ({ payload, degraded = false, degradedSince = null, servingTier = 'default', now } = {}) {
    const auth = this._getAuth()
    if (!auth || !auth.url) return { code: 0, skipped: true }
    const at = Number.isFinite(Number(now)) ? Number(now) : this._now()
    const src = isPlainObject(payload) ? payload : {}
    const configHash = String(src.config_hash || '')
    const lastAck = this._read(ACK_SETTING_KEY)
    const decision = decideAck({ lastAck, configHash, now: at, recovered: degraded })
    if (!decision.send) return { code: 0, skipped: true, ackType: null }
    const version = Number(src.config_version)
    const { applied, skipped } = summarizeAppliedBlocks(src)
    const body = {
      client_id: String(this._getClientId() || '').slice(0, 64),
      client_version: this._clientVersion(),
      config_version: Number.isInteger(version) && version >= 0 ? version : 0,
      config_hash: configHash,
      applied_blocks: applied,
      skipped_blocks: skipped,
      degraded: Boolean(degraded),
      degradation_tier: degraded ? (DEGRADATION_TIERS.includes(servingTier) ? servingTier : 'default') : null,
      ack_type: decision.ackType,
      degraded_since: degraded ? (isIsoish(degradedSince) ? degradedSince : new Date(at).toISOString()) : null,
    }
    const errors = validateAckPayload(body)
    if (errors.length) {
      this._notify('ack-payload-invalid', { errors })
      return { code: -1, message: 'invalid-payload: ' + errors.join(','), ackType: decision.ackType }
    }
    const result = await this._postJson(auth, ENDPOINT_ACK, body)
    // skipped ≠ 成功：不写 ACK 记录。否则「没发出去」会被当成「已确认生效」，
    // 既污染看板（服务端其实从未收到），又让下一次 ACK 被 24h 心跳窗口挡住。
    if (result.skipped) {
      this._notify('ack-report-skipped', { ackType: decision.ackType, reason: result.reason || 'no-transport' })
      return { code: 0, skipped: true, ackType: decision.ackType }
    }
    if (result.code !== 0) {
      this._notify('ack-report-failed', { message: result.message, ackType: decision.ackType })
      return { code: -1, message: result.message, ackType: decision.ackType }
    }
    this._write(ACK_SETTING_KEY, { configHash, ackType: decision.ackType, at: at, atIso: new Date(at).toISOString() })
    return { code: 0, ackType: decision.ackType }
  }

  /** 降级/ACK 状态读数（供启动日志与排障；不抛错） */
  getState () {
    const state = this._queue()
    const open = state.open ? state.events.find((e) => isPlainObject(e) && e.id === state.open.id) : null
    const ack = this._read(ACK_SETTING_KEY)
    return {
      degraded: Boolean(open),
      consecutiveFailures: open ? Number(open.consecutive_failures) || 0 : 0,
      degradedSince: open ? open.degraded_since || null : null,
      servingTier: open ? open.serving_tier || 'default' : 'default',
      queued: state.events.length,
      lastAckHash: typeof ack.configHash === 'string' ? ack.configHash : '',
      lastAckAt: Number.isFinite(Number(ack.at)) ? Number(ack.at) : 0,
      lastAckType: typeof ack.ackType === 'string' ? ack.ackType : '',
    }
  }
}

module.exports = {
  OpsResilienceReporter,
  ACK_HEARTBEAT_INTERVAL_MS,
  ACK_SETTING_KEY,
  ACK_TYPES,
  CHANNELS,
  DEGRADATION_SETTING_KEY,
  DEGRADATION_TIERS,
  ENDPOINT_ACK,
  ENDPOINT_DEGRADATION,
  FAILURE_KINDS,
  MAX_DEGRADATION_QUEUE,
  MAX_EVENT_BYTES,
  RUNTIME_ENDPOINT,
  classifyFailureKind,
  decideAck,
  resolveClientIdentity,
  resolveResilienceAuth,
  summarizeAppliedBlocks,
  tagOpsError,
  validateAckPayload,
  validateDegradationPayload,
}