/**
 * creator-monitor.js — 博主监控的纯逻辑层：失败分级与配额求解
 *
 * 本模块只放**可被单测完全覆盖的纯逻辑**，不碰数据库与网络。
 * 副作用（探测、采集、落库）由 creator-store / creator-collector 承担。
 *
 * ## 失败分级为什么按 reason 而非 HTTP 状态码
 *
 * YouTube Data API 的节流类错误**全部返回 403**：
 * quotaExceeded / dailyLimitExceeded / rateLimitExceeded / userRateLimitExceeded。
 * 若按「4xx=可自愈、5xx=瞬时」粗判，配额耗尽会被当成真故障累计到自动暂停——
 * **用户因为配额被锁死**，而配额是每天自然恢复的，不该触发暂停。
 * 反向也踩过：ipRefererBlocked 是**应用级** 403（Key/IP/referrer 被拒），
 * 若归为「单条错误」则表现为「每条都失败但博主永不暂停」，监控静默失效。
 *
 * 因此分类依据是 `error.errors[].reason`，状态码仅在 reason 缺失时兜底。
 */

'use strict'

const FAILURE_TIERS = {
  /** 正常节流：等下个周期即可，MUST NOT 计入连续失败 */
  THROTTLED: 'throttled',
  /** 瞬时故障：5xx / 网络抖动，指数退避重试，不计入连续失败 */
  TRANSIENT: 'transient',
  /** 博主级真故障：连续 3 次触发 auto_paused */
  PERMANENT: 'permanent',
  /** 不可自愈：凭证问题，首次即 fatal_paused，UI 指向设置页 */
  FATAL: 'fatal',
  /** 单资源级：只影响这一条 discovery，MUST NOT 影响博主监控状态 */
  ITEM: 'item',
}

/** reason 优先级：配额 > 鉴权 > 资源不存在 > 单条 > 兜底。
 *  响应体可能带多个 errors[]；顺序固定，否则「配额+鉴权」会被鉴权抢先，
 *  配额耗尽又被误报成凭证问题，用户会去改一个没坏的 Key。 */
const REASON_PRIORITY = [
  { reasons: ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded',
    'userRateLimitExceeded', 'userRateLimitExceededUnreg'], tier: FAILURE_TIERS.THROTTLED },
  { reasons: ['keyInvalid', 'keyNotValid', 'badRequest', 'accessNotConfigured',
    'accessForbidden', 'forbidden', 'ipRefererBlocked', 'youtubeSignupRequired'],
  tier: FAILURE_TIERS.FATAL },
  { reasons: ['channelNotFound', 'playlistNotFound', 'invalidPageToken'],
    tier: FAILURE_TIERS.PERMANENT },
  { reasons: ['videoNotFound'], tier: FAILURE_TIERS.ITEM },
  { reasons: ['backendError', 'internalError', 'rateLimitBackend'], tier: FAILURE_TIERS.TRANSIENT },
]

/** 哪些分级会计入「连续失败」并最终导致暂停 */
const COUNTS_AS_FAILURE = new Set([
  FAILURE_TIERS.PERMANENT, FAILURE_TIERS.FATAL,
])

const TRANSPORT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])

/** 探测需求的可复算基准：日次数 = 1440 分钟 / 间隔分钟数 */
const PROJECTION_BASIS = '1440/interval_min'

const DEFAULT_INTERVAL_MIN = 60

function firstReason (body) {
  if (!body || typeof body !== 'object') return null
  const err = body.error && typeof body.error === 'object' ? body.error : body
  const list = Array.isArray(err.errors) ? err.errors : []
  // 按优先级表遍历，每个候选 reason 集合内保持声明顺序
  for (const group of REASON_PRIORITY) {
    for (const want of group.reasons) {
      if (list.some(e => e && e.reason === want)) return { reason: want, tier: group.tier }
    }
  }
  const any = list.find(e => e && e.reason)
  return any ? { reason: any.reason, tier: null } : null
}

/**
 * 把一次失败分级。
 *
 * @param {number} httpStatus HTTP 状态码（无响应时为 0）
 * @param {object|null} body   响应体
 * @param {Error|null}  transportErr 传输层错误（没拿到 HTTP 响应时）
 * @returns {{tier: string, reason: string, countsAsFailure: boolean, retryable: boolean}}
 *   刻意不携带 apiKey / 原始响应体，避免凭证与长文本经日志泄漏。
 */
function classifyFailure (httpStatus, body, transportErr) {
  if (transportErr) {
    const transient = TRANSPORT_CODES.has(transportErr.code)
    return {
      tier: transient ? FAILURE_TIERS.TRANSIENT : FAILURE_TIERS.PERMANENT,
      reason: transportErr.code ? `transport:${transportErr.code}` : 'transport:unknown',
      countsAsFailure: !transient,
      retryable: transient,
    }
  }

  const hit = firstReason(body)
  if (hit && hit.tier) {
    return {
      tier: hit.tier,
      reason: hit.reason,
      countsAsFailure: COUNTS_AS_FAILURE.has(hit.tier),
      retryable: !COUNTS_AS_FAILURE.has(hit.tier),
    }
  }

  // reason 缺失或未识别 → 用状态码兜底
  const status = Number(httpStatus) || 0
  if (status === 429) return mk(FAILURE_TIERS.THROTTLED, 'http_429')
  if (status === 401) return mk(FAILURE_TIERS.FATAL, 'http_401')
  if (status === 403) return mk(FAILURE_TIERS.FATAL, 'http_403_no_reason')
  if (status >= 500) return mk(FAILURE_TIERS.TRANSIENT, `http_${status}`)
  // 未识别 = fail-closed：计入失败。放行会让所有无法识别的错误无声跳过。
  return mk(FAILURE_TIERS.PERMANENT, (hit && hit.reason) || `unknown_http_${status}`)
}

function mk (tier, reason) {
  const countsAsFailure = COUNTS_AS_FAILURE.has(tier)
  return { tier, reason, countsAsFailure, retryable: !countsAsFailure }
}

/** 规整间隔：缺失/非法一律回落到默认 60，避免产生 NaN / Infinity 把配额算崩 */
function normalizeInterval (raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN
  return n
}

/** 日探测需求（units）= Σ(1440 / interval_min)。稳态每次探测恒为 1 unit。 */
function projectedProbeUnits (follows) {
  const list = Array.isArray(follows) ? follows : []
  return list.reduce((sum, f) => sum + 1440 / normalizeInterval(f && f.check_interval_min), 0)
}

/**
 * 校验（新增或改间隔后）总探测需求是否落在池内。**必须在写库之前调用**。
 * @throws {Error & {code, projected, pool}} QuotaExceedError
 */
function assertQuotaFits (follows, pool, pendingAddition) {
  const list = Array.isArray(follows) ? follows.slice() : []
  if (pendingAddition) list.push(pendingAddition)
  const projected = projectedProbeUnits(list)
  if (projected > pool) {
    const err = new Error(
      `探测配额不足：预计每日消耗 ${Math.ceil(projected)} units，超出探测池 ${pool} units`
    )
    err.code = 'creator:quota_would_exceed'
    err.projected = Math.ceil(projected)
    err.pool = pool
    throw err
  }
  return projected
}

/**
 * 池子不足以覆盖全部关注项时的**确定性**保底/跳过集。
 *
 * 排序键固定为 (check_interval_min 升序, id 升序) —— **检查更频繁的优先保底**。
 * 语义取舍：频繁检查项单位成本更高，极端情况下单个 5 分钟关注项就能吃掉整个探测池。
 * 这正是 `assertQuotaFits` 必须在**配置变更时**拦截的原因：
 * 让这种状态压根产生不出来，比在运行时临时降级更可靠。
 *
 * 同一份数据 + 同一个池子 MUST 得到完全相同的结果 ——
 * 「有的查了有的没查」若不可复现，用户看到的现象就无法解释。
 *
 * @param {Array<{id:string, check_interval_min:number}>} follows
 * @param {number} pool 可用 units
 */
function buildSkipSet (follows, pool) {
  const list = (Array.isArray(follows) ? follows : []).slice()
  const ordered = list
    .map((f) => ({ f, interval: normalizeInterval(f && f.check_interval_min) }))
    .sort((a, b) => (a.interval - b.interval) || String(a.f.id).localeCompare(String(b.f.id)))
  const keep = []
  const skip = []
  let used = 0
  for (const { f, interval } of ordered) {
    const cost = 1440 / interval
    if (used + cost <= pool) { keep.push(f); used += cost } else skip.push(f)
  }
  return { keep, skip, projected: used }
}

module.exports = {
  FAILURE_TIERS,
  REASON_PRIORITY,
  PROJECTION_BASIS,
  DEFAULT_INTERVAL_MIN,
  classifyFailure,
  normalizeInterval,
  projectedProbeUnits,
  assertQuotaFits,
  buildSkipSet,
}