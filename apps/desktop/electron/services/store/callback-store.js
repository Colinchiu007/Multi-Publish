// @ts-check
/**
 * callback-store — 回调日志功能域 mixin
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

const DEFAULT_CALLBACK_LOG_LIMIT = 50
const MAX_CALLBACK_LOG_LIMIT = 200

function normalizeCallbackLogLimit (limit) {
  if (!Number.isSafeInteger(limit)) return DEFAULT_CALLBACK_LOG_LIMIT
  return Math.max(0, Math.min(MAX_CALLBACK_LOG_LIMIT, limit))
}

module.exports = {
  addCallbackLog (type, source, payload, ownerSubject) {
    if (!this._ready) return
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (owner === null) return
    this.db.prepare(
      'INSERT INTO callback_logs (owner_subject, type, source, payload) VALUES (?, ?, ?, ?)'
    ).run(owner, type, source || '', JSON.stringify(payload || {}))
  },

  listCallbackLogs (limit = 50, ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (owner === null) return []
    const boundedLimit = normalizeCallbackLogLimit(limit)
    return this.db.prepare(
      'SELECT * FROM callback_logs WHERE owner_subject = ? ORDER BY created_at DESC LIMIT ?'
    ).all(owner, boundedLimit).map(r => ({ ...r, payload: this._safeJson(r.payload) }))
  },
}
