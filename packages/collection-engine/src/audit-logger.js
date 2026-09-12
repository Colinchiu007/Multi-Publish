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

// 敏感查询参数脱敏（与 apps/desktop logger.redactText 语义对齐，独立实现避免跨包依赖）：
// OAuth code / token / key / secret / password 类参数值替换为 [REDACTED]
const SENSITIVE_QUERY_KEYS = /(token|secret|password|passwd|api[_-]?key|access[_-]?key|auth|credential|code)/i

function redactUrlString (value) {
  if (typeof value !== 'string') return value
  try {
    const u = new URL(value)
    let redacted = false
    for (const [k] of u.searchParams) {
      if (SENSITIVE_QUERY_KEYS.test(k)) {
        u.searchParams.set(k, '[REDACTED]')
        redacted = true
      }
    }
    // 无敏感参数时返回原字符串，避免 URL 往返序列化副作用（如补尾斜杠）
    return redacted ? u.toString() : value
  } catch {
    // 非 URL 字符串：对 key=value 形态做保守脱敏
    return value.replace(/([?&;][\w-]*(?:token|secret|password|passwd|key|auth|credential|code)[\w-]*=)[^&;\s]*/gi, "$1[REDACTED]")
  }
}

function redactRecord (record) {
  if (!record || typeof record !== 'object') return record
  const out = { ...record }
  if (typeof out.url === 'string') out.url = redactUrlString(out.url)
  if (typeof out.error === 'string') {
    out.error = out.error.replace(/(token|secret|password|api[_-]?key)=[^\s&;]+/gi, '$1=[REDACTED]')
  }
  return out
}

class AuditLogger {
  constructor (opts = {}) {
    this._dir = opts.dir || null
    this._buffer = []
    this._flushTimer = null
    this._flushMs = opts.flushMs || 5000
    this._droppedCount = 0
    // logging-coverage-audit：无 dir 时此前完全静默丢弃所有审计事件（url-collector.js:50 注释证实为真实回归坑）
    if (opts.enabled !== false && !this._dir) {
      console.warn('[audit-logger] no dir configured — all audit/blocked events will be dropped (pass opts.dir to enable persistence)')
    }
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
    // 无目录时禁用落盘也禁用缓冲（回归审查 M5：防 buffer 无限增长）
    if (!this._dir) {
      this._droppedCount += 1
      if (this._droppedCount === 1 || this._droppedCount % 100 === 0) {
        console.warn('[audit-logger] audit event dropped (no dir configured, droppedCount=' + this._droppedCount + ') level=' + level + ' event=' + (entry && entry.event))
      }
      return
    }
    const record = {
      ts: new Date().toISOString(),
      level,
      ...redactRecord(entry),
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
