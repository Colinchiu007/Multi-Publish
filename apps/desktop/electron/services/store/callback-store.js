// @ts-check
/**
 * callback-store — 回调日志功能域 mixin
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

module.exports = {
  addCallbackLog (type, source, payload) {
    if (!this._ready) return
    this.db.prepare(
      'INSERT INTO callback_logs (type, source, payload) VALUES (?, ?, ?)'
    ).run(type, source || '', JSON.stringify(payload || {}))
  },

  listCallbackLogs (limit = 50) {
    if (!this._ready) return []
    return this.db.prepare(
      'SELECT * FROM callback_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit).map(r => ({ ...r, payload: this._safeJson(r.payload) }))
  },
}
