// @ts-check
/**
 * usage-reporter.js — 模型调用用量脱敏上报（主进程）
 *
 * 从 model_provider_logs 读取自上次水印（settings opsCenterUsageReport.lastId）以来的
 * 调用记录，按「上报日期 + provider + category + action」聚合（调用/成功/失败/限流/耗时/
 * tokens/成本/耗时分布桶），POST 到 ops-center /api/v1/usage/ingest（X-Catalog-Key 鉴权）。
 *
 * 安全：
 *   - 不上报 error_message / model 原文等敏感内容，仅聚合计数
 *   - 未配置 ops-center URL/Key 时静默跳过，不影响主流程
 *   - 上报失败保留水印，下次重试不丢数据（服务端按桶 upsert 累加，幂等）
 */
'use strict'

const SETTING_KEY = 'opsCenterUsageReport'
const INTERVAL_MS = 30 * 60 * 1000
const INITIAL_DELAY_MS = 5 * 1000
const MAX_ROWS_PER_REPORT = 5000
const SYNC_TIMEOUT_MS = 10 * 1000

function classifyStatus (row) {
  const status = String(row.status || '')
  const msg = String(row.error_message || '').toLowerCase()
  if (status === 'success') return { ok: true, ratelimit: false }
  const ratelimit = status.toLowerCase().includes('ratelimit') ||
    status.toLowerCase().includes('rate_limit') ||
    msg.includes('rate limit') || msg.includes('限流') || msg.includes('429') ||
    msg.includes('quota') || msg.includes('too many requests')
  return { ok: false, ratelimit }
}

class UsageReporter {
  constructor ({ store, log, getOpsCenterAuth, getClientId }) {
    this._store = store
    this._log = log || { info() {}, warn() {}, error() {} }
    this._getOpsCenterAuth = typeof getOpsCenterAuth === 'function' ? getOpsCenterAuth : () => null
    this._getClientId = typeof getClientId === 'function' ? getClientId : () => ''
    this._timer = null
  }

  /** 启动周期上报：5s 首报 + 30min 周期（定时器不阻止进程退出） */
  start () {
    if (this._timer) return
    this._timer = setInterval(() => {
      this.reportPending().catch(() => {})
    }, INTERVAL_MS)
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref()
    setTimeout(() => {
      this.reportPending().catch(() => {})
    }, INITIAL_DELAY_MS)
  }

  stop () {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  _getWatermark () {
    let raw = ''
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let data = {}
    if (raw) { try { data = JSON.parse(raw) } catch { data = {} } }
    return Number(data.lastId) || 0
  }

  _saveWatermark (id) {
    try { this._store.setSetting(SETTING_KEY, JSON.stringify({ lastId: id, reportedAt: new Date().toISOString() })) } catch { /* 非关键 */ }
  }

  /** 聚合待上报日志并上报；返回 {code, skipped?, reported?} */
  async reportPending () {
    const auth = this._getOpsCenterAuth()
    if (!auth || !auth.url || !auth.apiKey) return { code: 0, skipped: true }
    const db = this._store && this._store.db
    if (!db || typeof db.prepare !== 'function') return { code: 0, skipped: true }

    const lastId = this._getWatermark()
    let rows
    try {
      rows = db.prepare(
        'SELECT id, provider_id, category, action, status, latency_ms, tokens_in, tokens_out, cost, error_message, created_at ' +
        'FROM model_provider_logs WHERE id > ? ORDER BY id ASC LIMIT ?'
      ).all(lastId, MAX_ROWS_PER_REPORT)
    } catch (e) {
      this._log.warn('UsageReporter', 'read logs failed: ' + e.message)
      return { code: -1, message: e.message }
    }
    if (!rows || rows.length === 0) return { code: 0, reported: 0 }

    const today = new Date().toISOString().slice(0, 10)
    const buckets = new Map()
    let maxId = lastId
    let firstId = Number.MAX_SAFE_INTEGER
    for (const row of rows) {
      const id = Number(row.id)
      if (Number.isFinite(id) && id > maxId) maxId = id
      if (Number.isFinite(id) && id < firstId) firstId = id
      const usageDate = String(row.created_at || '').slice(0, 10) || today
      const key = [usageDate, row.provider_id, row.category || 'llm', row.action].join('\u0000')
      let b = buckets.get(key)
      if (!b) {
        b = {
          usage_date: usageDate, provider_id: row.provider_id, category: row.category || 'llm', action: row.action,
          calls: 0, ok_count: 0, fail_count: 0, ratelimit_count: 0,
          latency_ms: 0, tokens_in: 0, tokens_out: 0, cost: 0,
          buckets: { lt1s: 0, '1to3s': 0, '3to10s': 0, gt10s: 0 },
        }
        buckets.set(key, b)
      }
      const cls = classifyStatus(row)
      b.calls += 1
      if (cls.ok) b.ok_count += 1
      else {
        b.fail_count += 1
        if (cls.ratelimit) b.ratelimit_count += 1
      }
      const ms = Number(row.latency_ms) || 0
      b.latency_ms += ms
      b.tokens_in += Number(row.tokens_in) || 0
      b.tokens_out += Number(row.tokens_out) || 0
      b.cost += Number(row.cost) || 0
      if (ms < 1000) b.buckets.lt1s += 1
      else if (ms < 3000) b.buckets['1to3s'] += 1
      else if (ms < 10000) b.buckets['3to10s'] += 1
      else b.buckets.gt10s += 1
    }

    const items = []
    for (const b of buckets.values()) {
      items.push({
        usage_date: b.usage_date,
        client_id: this._getClientId(),
        provider_id: b.provider_id,
        category: b.category,
        action: b.action,
        calls: b.calls,
        ok_count: b.ok_count,
        fail_count: b.fail_count,
        ratelimit_count: b.ratelimit_count,
        latency_ms: b.latency_ms,
        tokens_in: b.tokens_in,
        tokens_out: b.tokens_out,
        cost: b.cost,
        latency_buckets: b.buckets,
      })
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null
    try {
      const resp = await fetch(String(auth.url).replace(/\/+$/, '') + '/api/v1/usage/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Catalog-Key': auth.apiKey, Accept: 'application/json' },
        body: JSON.stringify({ items, batch_id: this._getClientId() + ':' + lastId + ':' + maxId, synced_at: new Date().toISOString() }),
        redirect: 'error',
        signal: controller && controller.signal,
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      this._saveWatermark(maxId)
      this._log.info('UsageReporter', `reported ${items.length} buckets / ${rows.length} calls (watermark ${maxId})`)
      return { code: 0, reported: items.length }
    } catch (e) {
      const isTimeout = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')
      this._log.warn('UsageReporter', 'report failed: ' + (isTimeout ? 'timeout' : e.message))
      return { code: -1, message: isTimeout ? 'timeout' : e.message }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

module.exports = { UsageReporter, classifyStatus }
