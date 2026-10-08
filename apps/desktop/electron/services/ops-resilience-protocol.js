// @ts-check
/**
 * ops-resilience-protocol.js — 上报载荷的**构造与校验**判据（纯函数，无状态）
 *
 * 为什么单独成文件（2026-10-08，ops-center-resilience）：
 *   `ops-resilience-reporter.js` 逼近 max-lines 门禁（CI 按 LF 计 500 行硬上限），
 *   而「载荷长什么样、什么载荷合法」是一组边界清晰的纯函数 —— 它们与「什么时候发、发到哪」
 *   正交，混在一起只会让两个轴各自变难测。
 *
 * 这组判据是**跨端契约的客户端镜像**：服务端 `resilience_service.py` 有同名校验，
 * 两端 MUST 逐条对齐（design.md §2.3 / §3.2）。客户端侧先验一遍再发，
 * 目的是**绝不把服务端会 400 的脏数据投出去** —— 看板是运营判断「配置是否生效」的唯一依据，
 * 脏数据进去比拿不到数据更糟。
 */

const { RUNTIME_BLOCKS } = require('./ops-runtime-snapshot')

const ACK_HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 契约白名单（design §2.2 / §3.2，服务端同款校验） */
const FAILURE_KINDS = ['timeout', 'dns', 'network', 'http_4xx', 'http_5xx', 'verify_failed', 'invalid_payload', 'auth_failed']
const DEGRADATION_TIERS = ['L1', 'L2', 'L3', 'default']
const ACK_TYPES = ['applied', 'heartbeat', 'recovered']
const CHANNELS = ['runtime', 'entitlement']

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const isIsoish = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40 && Number.isFinite(Date.parse(v))

/**
 * ACK 频率控制（design §2.4）。用 config_hash 而非 config_version 判断：
 * 否则每次发版所有客户端都会上报一次（推送地狱）。
 */
function decideAck ({ lastAck, configHash, now, recovered }) {
  if (!/^[0-9a-f]{16}$/.test(String(configHash || ''))) return { send: false, ackType: null }
  if (recovered) return { send: true, ackType: 'recovered' }
  if (!isPlainObject(lastAck)) return { send: true, ackType: 'applied' }
  if (lastAck.configHash !== configHash) return { send: true, ackType: 'applied' }
  const lastAt = Number(lastAck.at)
  if (!Number.isFinite(lastAt)) return { send: true, ackType: 'applied' }
  if ((Number(now) - lastAt) >= ACK_HEARTBEAT_INTERVAL_MS) return { send: true, ackType: 'heartbeat' }
  return { send: false, ackType: null }
}

/** 13 个块的 applied/skipped 统计：块名取 payload 原键，与 config_hash 的块集合同源 */
function summarizeAppliedBlocks (payload) {
  const src = isPlainObject(payload) ? payload : {}
  const applied = {}
  const skipped = []
  for (const block of RUNTIME_BLOCKS) {
    const value = src[block]
    if (value === undefined || value === null) { skipped.push(block); continue }
    if (Array.isArray(value)) applied[block] = value.length
    else if (isPlainObject(value)) applied[block] = Object.keys(value).length
    else skipped.push(block)
  }
  return { applied, skipped }
}

/** ACK 载荷校验（镜像服务端 design §2.3）：返回错误码数组，空数组 = 可发送 */
function validateAckPayload (payload) {
  const errors = []
  if (!isPlainObject(payload)) return ['ACK_NOT_OBJECT']
  if (typeof payload.client_id !== 'string' || !payload.client_id || payload.client_id.length > 64) errors.push('client_id')
  if (payload.client_version !== undefined && payload.client_version !== null &&
      (typeof payload.client_version !== 'string' || payload.client_version.length > 32)) errors.push('client_version')
  if (!Number.isInteger(payload.config_version) || payload.config_version < 0) errors.push('config_version')
  if (!/^[0-9a-f]{16}$/.test(String(payload.config_hash || ''))) errors.push('config_hash')
  if (!ACK_TYPES.includes(payload.ack_type)) errors.push('ack_type')
  if (payload.degraded !== undefined && typeof payload.degraded !== 'boolean') errors.push('degraded')
  if (payload.degraded === true) {
    if (!DEGRADATION_TIERS.includes(payload.degradation_tier)) errors.push('degradation_tier')
    if (!isIsoish(payload.degraded_since)) errors.push('degraded_since')
  }
  if (payload.applied_blocks !== undefined && payload.applied_blocks !== null) {
    if (!isPlainObject(payload.applied_blocks)) errors.push('applied_blocks')
    else {
      const keys = Object.keys(payload.applied_blocks)
      if (keys.length > 32) errors.push('applied_blocks')
      for (const key of keys) {
        const value = payload.applied_blocks[key]
        if (!Number.isInteger(value) || value < 0) { errors.push('applied_blocks'); break }
      }
    }
  }
  if (payload.skipped_blocks !== undefined && payload.skipped_blocks !== null) {
    if (!Array.isArray(payload.skipped_blocks)) errors.push('skipped_blocks')
    else if (payload.skipped_blocks.length > 32 || payload.skipped_blocks.some((b) => typeof b !== 'string' || b.length > 64)) {
      errors.push('skipped_blocks')
    }
  }
  return errors
}

/** 降级载荷校验（镜像服务端 design §3.2） */
function validateDegradationPayload (payload) {
  const errors = []
  if (!isPlainObject(payload)) return ['DEGRADATION_NOT_OBJECT']
  if (typeof payload.client_id !== 'string' || !payload.client_id || payload.client_id.length > 64) errors.push('client_id')
  if (!CHANNELS.includes(payload.channel)) errors.push('channel')
  if (payload.endpoint !== undefined && payload.endpoint !== null &&
      (typeof payload.endpoint !== 'string' || payload.endpoint.length > 200)) errors.push('endpoint')
  if (!FAILURE_KINDS.includes(payload.failure_kind)) errors.push('failure_kind')
  if (!Number.isInteger(payload.consecutive_failures) || payload.consecutive_failures < 1) errors.push('consecutive_failures')
  if (!isIsoish(payload.degraded_since)) errors.push('degraded_since')
  if (!Number.isInteger(payload.offline_seconds) || payload.offline_seconds < 0) errors.push('offline_seconds')
  if (!DEGRADATION_TIERS.includes(payload.serving_tier)) errors.push('serving_tier')
  if (payload.recovered_at !== undefined && payload.recovered_at !== null && !isIsoish(payload.recovered_at)) errors.push('recovered_at')
  return errors
}

/**
 * client_id / client_version（design §2.2 与 §3.2）。
 * client_id 取 userData 路径的 sha256 前 16 位 —— 稳定、不可反推用户身份、跨重启一致，
 * 与既有 usage/diagnostics reporter 的口径一致（phase1-context.js 同一算法）。
 * 非 Electron 环境（单测 / CLI 导出）回落 os 口径，保证任何上下文都能算出合法 client_id。
 */
function resolveClientIdentity () {
  let seed = ''
  let clientVersion = ''
  try {
    const { app } = require('electron')
    seed = String(app.getPath('userData') || '')
    clientVersion = String(app.getVersion() || '')
  } catch (_) { /* 非 Electron 环境 */ }
  if (!seed) {
    try { const os = require('os'); seed = String(os.hostname() || '') + '|' + String(os.userInfo().username || '') } catch (_) { seed = '' }
  }
  return {
    clientId: require('crypto').createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 16),
    clientVersion: clientVersion.slice(0, 32),
  }
}

/**
 * 上报鉴权解析（design §2.1/§3.1：Bearer JWT 或 X-Catalog-Key）。
 * 判据与 OpsCenterSync.syncNow 同源：手动态用 catalog key，零配置自动发现态用 bearer；
 * 两者都没有则返回 null（本模块所有入口据此静默跳过，绝不匿名打对端）。
 */
function resolveResilienceAuth ({ manualUrl, auto, apiKeyConfigured, readEncryptedKey } = {}) {
  const url = manualUrl || (auto && auto.url ? auto.url : '')
  if (!url) return null
  if (!manualUrl && auto && !apiKeyConfigured) return { url, getAccessToken: auto.getAccessToken }
  let apiKey
  try { apiKey = typeof readEncryptedKey === 'function' ? String(readEncryptedKey() || '') : '' } catch (_) { apiKey = '' }
  if (apiKey) return { url, apiKey }
  return auto ? { url, getAccessToken: auto.getAccessToken } : null
}

module.exports = {
  ACK_HEARTBEAT_INTERVAL_MS,
  ACK_TYPES,
  CHANNELS,
  DEGRADATION_TIERS,
  FAILURE_KINDS,
  decideAck,
  isIsoish,
  resolveClientIdentity,
  resolveResilienceAuth,
  summarizeAppliedBlocks,
  validateAckPayload,
  validateDegradationPayload,
}