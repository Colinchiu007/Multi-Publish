// @ts-check
/**
 * diagnostics-reporter.js — 视频创作失败诊断脱敏上报（主进程）
 *
 * PipelineEngine 经 setRunFinalizedHook 在 run 终结时 enqueue 白名单样本到本地
 * sqlite 队列表（diagnostics_queue，run_id 唯一，仅编排模式 run），reporter 按
 * watermark（队列 id）周期上报：
 *   - daily：按「本地日期 + pipeline」聚合 total/failed/success/cancelled（失败率分母）
 *   - samples：失败 run 白名单样本（≤ MAX_SAMPLES_PER_REPORT/批）
 *   POST ops-center /api/v1/diagnostics/ingest（X-Catalog-Key 鉴权）。
 *
 * 安全（与 usage/publish reporter 一致）：
 *   - 白名单：仅 run_id/日期/pipeline/status/stage/failure_type/severity/recoverability/
 *     cause_id/duration_ms/env{disk_free_bytes,python_backend}，不含 errorParams/凭据/路径明文
 *   - 未配置 ops-center URL/Key 时静默跳过，不影响主流程
 *   - 上报失败保留 watermark，下次重试不丢（服务端 batch + run_id 幂等）
 */
'use strict'

const SETTING_KEY = 'opsCenterDiagnosticsReport'
const INTERVAL_MS = 30 * 60 * 1000
const INITIAL_DELAY_MS = 5 * 1000
const MAX_QUEUE_ROWS = 5000
const MAX_SAMPLES_PER_REPORT = 50
const MAX_DAILY_ITEMS = 400
const SYNC_TIMEOUT_MS = 10 * 1000
const TAXONOMY_VERSION = 1

// 枚举复用 diagnostics taxonomy（单一来源，避免两端/两文件漂移；服务端同样校验）
const {
  DIAG_STAGES,
  DIAG_FAILURE_TYPES,
  DIAG_SEVERITY,
  DIAG_RECOVERABILITY,
  UNKNOWN,
} = require('./diagnostics/taxonomy')
const KNOWN_STATUS = ['completed', 'failed', 'cancelled']

function toLocalDate (iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
  } catch (_) { return '' }
}

function _numOrNull (v) {
  return Number.isFinite(Number(v)) ? Number(v) : null
}

/**
 * 从 run 构造白名单样本（纯函数，永不抛错）。
 * @param {object} run
 * @returns {object|null}
 */
function toDiagnosticsSample (run) {
  try {
    if (!run || typeof run !== 'object' || !run.id || !run.diagnostics) return null
    const d = run.diagnostics
    const failure = d.failure && typeof d.failure === 'object' ? d.failure : {}
    const status = String(run.status || '')
    if (!KNOWN_STATUS.includes(status)) return null
    const candidates = Array.isArray(failure.candidates) ? failure.candidates : []
    const causeId = candidates.length > 0 && candidates[0].causeId ? candidates[0].causeId : null
    const env = d.env && typeof d.env === 'object'
      ? {
          disk_free_bytes: _numOrNull(d.env.diskFreeBytes),
          python_backend: typeof d.env.sidecars === 'object' && d.env.sidecars !== null
            ? (d.env.sidecars.pythonBackend === true)
            : null,
        }
      : null
    return {
      run_id: String(run.id).slice(0, 120),
      diag_date: toLocalDate(run.endedAt || d.generatedAt),
      pipeline: String(run.pipeline || '').slice(0, 80),
      status,
      stage: typeof failure.stage === 'string' && DIAG_STAGES.includes(failure.stage) ? failure.stage : UNKNOWN,
      failure_type: typeof failure.failureType === 'string' && DIAG_FAILURE_TYPES.includes(failure.failureType) ? failure.failureType : UNKNOWN,
      severity: typeof failure.severity === 'string' && DIAG_SEVERITY.includes(failure.severity) ? failure.severity : UNKNOWN,
      recoverability: typeof failure.recoverability === 'string' && DIAG_RECOVERABILITY.includes(failure.recoverability) ? failure.recoverability : UNKNOWN,
      cause_id: causeId,
      duration_ms: _numOrNull(d.durationMs),
      env,
    }
  } catch (_) {
    return null
  }
}

class DiagnosticsReporter {
  constructor ({ store, log, getOpsCenterAuth, getClientId }) {
    this._store = store
    this._log = log || { info() {}, warn() {}, error() {} }
    this._getOpsCenterAuth = typeof getOpsCenterAuth === 'function' ? getOpsCenterAuth : () => null
    this._getClientId = typeof getClientId === 'function' ? getClientId : () => ''
    this._timer = null
  }

  start () {
    if (this._timer) return
    this._timer = setInterval(() => { this.reportPending().catch(() => {}) }, INTERVAL_MS)
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref()
    setTimeout(() => { this.reportPending().catch(() => {}) }, INITIAL_DELAY_MS)
  }

  stop () {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  _db () {
    return this._store && typeof this._store.db === 'object' && this._store.db && typeof this._store.db.prepare === 'function' ? this._store.db : null
  }

  _ensureTable (db) {
    db.prepare(
      'CREATE TABLE IF NOT EXISTS diagnostics_queue (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT UNIQUE, created_at TEXT, payload TEXT)'
    ).run()
  }

  /** 入队一个 run 的白名单样本（仅编排模式 + 终态 + 已附加 diagnostics） */
  enqueue (run) {
    const db = this._db()
    if (!db) return false
    if (!run || run.orchestrationMode !== 'orchestrator') return false
    if (run.status !== 'failed' && run.status !== 'completed' && run.status !== 'cancelled') return false
    const sample = toDiagnosticsSample(run)
    if (!sample) return false
    try {
      this._ensureTable(db)
      db.prepare('INSERT OR IGNORE INTO diagnostics_queue (run_id, created_at, payload) VALUES (?, ?, ?)')
        .run(String(run.id), new Date().toISOString(), JSON.stringify(sample))
      // 队列上限：持续上报失败时裁剪最旧行，防止本地表无限增长
      try {
        db.prepare('DELETE FROM diagnostics_queue WHERE id < (SELECT MAX(id) - ? FROM diagnostics_queue)').run(MAX_QUEUE_ROWS)
      } catch (e) { this._log.warn('DiagnosticsReporter', 'queue trim failed: ' + e.message) }
      return true
    } catch (e) {
      this._log.warn('DiagnosticsReporter', 'enqueue failed: ' + e.message)
      return false
    }
  }

  _getWatermark () {
    let raw
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let data = {}
    if (raw) { try { data = JSON.parse(raw) } catch { data = {} } }
    return Number(data.lastId) || 0
  }

  _saveWatermark (id) {
    try { this._store.setSetting(SETTING_KEY, JSON.stringify({ lastId: id, reportedAt: new Date().toISOString() })) } catch { /* 非关键 */ }
  }

  async reportPending () {
    const auth = this._getOpsCenterAuth()
    if (!auth || !auth.url || !auth.apiKey) return { code: 0, skipped: true }
    const db = this._db()
    if (!db) return { code: 0, skipped: true }

    let rows
    try {
      this._ensureTable(db)
      rows = db.prepare('SELECT id, payload FROM diagnostics_queue WHERE id > ? ORDER BY id ASC LIMIT ?').all(this._getWatermark(), MAX_QUEUE_ROWS)
    } catch (e) {
      this._log.warn('DiagnosticsReporter', 'read queue failed: ' + e.message)
      return { code: -1, message: e.message }
    }
    if (!rows || rows.length === 0) return { code: 0, reported: 0 }

    const daily = new Map()
    const samples = []
    let maxId = this._getWatermark()
    for (const row of rows) {
      const id = Number(row.id)
      if (Number.isFinite(id) && id > maxId) maxId = id
      let sample
      try { sample = JSON.parse(row.payload || 'null') } catch (_) { sample = null }
      if (!sample || typeof sample !== 'object') continue
      const date = String(sample.diag_date || '').slice(0, 10)
      const pipeline = String(sample.pipeline || '').slice(0, 80)
      const key = date + '\u0000' + pipeline
      let b = daily.get(key)
      if (!b) { b = { diag_date: date, pipeline, total: 0, failed: 0, success: 0, cancelled: 0 }; daily.set(key, b) }
      b.total += 1
      if (sample.status === 'failed') b.failed += 1
      else if (sample.status === 'completed') b.success += 1
      else if (sample.status === 'cancelled') b.cancelled += 1
      if (sample.status === 'failed' && samples.length < MAX_SAMPLES_PER_REPORT) samples.push(sample)
    }

    const items = []
    for (const b of daily.values()) {
      items.push({
        diag_date: b.diag_date,
        client_id: this._getClientId(),
        pipeline: b.pipeline,
        total_runs: b.total,
        failed_runs: b.failed,
        success_runs: b.success,
        cancelled_runs: b.cancelled,
      })
    }
    // 服务端 MAX_DAILY=500：长故障恢复积压时裁剪最旧桶，避免整批被 400 拒绝
    if (items.length > MAX_DAILY_ITEMS) {
      this._log.warn('DiagnosticsReporter', 'daily buckets trimmed from ' + items.length + ' to ' + MAX_DAILY_ITEMS)
      items.length = MAX_DAILY_ITEMS
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null
    try {
      const resp = await fetch(String(auth.url).replace(/\/+$/, '') + '/api/v1/diagnostics/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Catalog-Key': auth.apiKey, Accept: 'application/json' },
        body: JSON.stringify({
          daily: items,
          samples,
          batch_id: this._getClientId() + ':' + this._getWatermark() + ':' + maxId,
          taxonomy_version: TAXONOMY_VERSION,
          synced_at: new Date().toISOString(),
        }),
        redirect: 'error',
        signal: controller && controller.signal,
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      let data = null
      try { data = await resp.json() } catch (e) { data = null }
      if (data && data.duplicate === true) {
        // 服务端已确认过该批次（超时重试）：按 acked_max_id 推进水印，新行下周期上报，避免重复累加
        const acked = Number(data.acked_max_id) || 0
        if (acked > this._getWatermark()) {
          this._saveWatermark(acked)
          try {
            db.prepare('DELETE FROM diagnostics_queue WHERE id <= ?').run(acked)
          } catch (e) { this._log.warn('DiagnosticsReporter', 'queue cleanup failed: ' + e.message) }
        }
        this._log.info('DiagnosticsReporter', 'duplicate batch detected, watermark advanced to ' + acked)
        return { code: 0, duplicate: true, acked }
      }
      this._saveWatermark(maxId)
      try {
        db.prepare('DELETE FROM diagnostics_queue WHERE id <= ?').run(maxId)
      } catch (e) { this._log.warn('DiagnosticsReporter', 'queue cleanup failed: ' + e.message) }
      this._log.info('DiagnosticsReporter', `reported ${items.length} daily buckets / ${samples.length} samples (watermark ${maxId})`)
      return { code: 0, reported: items.length, samples: samples.length }
    } catch (e) {
      const isTimeout = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')
      this._log.warn('DiagnosticsReporter', 'report failed: ' + (isTimeout ? 'timeout' : e.message))
      return { code: -1, message: isTimeout ? 'timeout' : e.message }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

module.exports = { DiagnosticsReporter, toDiagnosticsSample, TAXONOMY_VERSION }
