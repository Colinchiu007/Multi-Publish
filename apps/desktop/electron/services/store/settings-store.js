// @ts-check
/**
 * settings-store — 应用设置功能域 mixin
 *
 * 依赖：store-schema.safeJsonParse / safeJsonStringify
 */
const { safeJsonParse, safeJsonStringify } = require('../store-schema')

module.exports = {
  getSetting (key, defaultValue = null) {
    if (!this._ready) return defaultValue
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return defaultValue
    return safeJsonParse(row.value, row.value)
  },

  setSetting (key, value) {
    if (!this._ready) return
    const str = safeJsonStringify(value)
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, str)
  },
}
