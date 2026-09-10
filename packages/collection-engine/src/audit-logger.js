/**
 * AuditLogger — L7 审计日志
 *
 * 职责：
 * 1. 记录所有采集请求的完整 trace
 * 2. 记录决策依据（为什么发 / 为什么不发）
 * 3. JSONL 文件持久化，按天分卷
 */

const fs = require('fs')
const path = require('path')
const NL = String.fromCharCode(10)

const LEVELS = { INFO: 'info', WARN: 'warn', ERROR: 'error', BLOCK: 'block' }

class AuditLogger {
  constructor (opts = {}) {
    this._dir = opts.dir || null
    this._buffer = []
    this._flushTimer = null
    this._flushMs = opts.flushMs || 5000
    if (opts.enabled !== false && this._dir) this._startFlush()
  }

  _today () {
    return new Date().toISOString().slice(0, 10)
  }

  _file () {
    return path.join(this._dir, 'collection-audit-' + this._today() + '.jsonl')
  }

  _startFlush () {
    if (this._flushTimer) return
    this._flushTimer = setInterval(() => this.flush(), this._flushMs)
    if (this._flushTimer.unref) this._flushTimer.unref()
  }

  stop () {
    if (this._flushTimer) clearInterval(this._flushTimer)
    this._flushTimer = null
    this.flush()
  }

  log (level, entry) {
    const record = {
      ts: new Date().toISOString(),
      level,
      ...entry,
    }
    this._buffer.push(record)
  }

  request (platform, accountId, url, status, durationMs, metadata = {}) {
    this.log(LEVELS.INFO, {
      event: 'request',
      platform,
      accountId,
      url,
      status,
      durationMs,
      ...metadata,
    })
  }

  blocked (platform, accountId, reason, detail = {}) {
    this.log(LEVELS.BLOCK, {
      event: 'blocked',
      platform,
      accountId,
      reason,
      ...detail,
    })
  }

  error (platform, accountId, error, context = {}) {
    this.log(LEVELS.ERROR, {
      event: 'error',
      platform,
      accountId,
      error: String(error && error.message || error),
      ...context,
    })
  }

  flush () {
    if (!this._dir || this._buffer.length === 0) return
    let toFlush = []
    try {
      fs.mkdirSync(this._dir, { recursive: true })
      toFlush = this._buffer.splice(0)
      const lines = toFlush.map(r => JSON.stringify(r)).join(NL)
      if (!lines) return
      fs.appendFileSync(this._file(), lines + NL, 'utf8')
    } catch (err) {
      if (toFlush.length > 0) {
        this._buffer = toFlush.concat(this._buffer)
      }
      console.error('[AuditLogger] flush failed:', err.message)
    }
  }
}

module.exports = { AuditLogger, LEVELS }
