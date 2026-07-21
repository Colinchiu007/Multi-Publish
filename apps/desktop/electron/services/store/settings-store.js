// @ts-check
/**
 * settings-store — 应用设置功能域 mixin
 *
 * 依赖：store-schema.safeJsonParse / safeJsonStringify
 */
const { safeJsonParse, safeJsonStringify } = require('../store-schema')
const { LEGACY_OWNER_SUBJECT } = require('../store-schema')
const crypto = require('crypto')

function scopedSettingKey (key, ownerSubject) {
  if (ownerSubject === LEGACY_OWNER_SUBJECT) return key
  const namespace = crypto.createHash('sha256').update(ownerSubject, 'utf8').digest('hex')
  return `user:${namespace}:${key}`
}

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

  getUserSetting (key, defaultValue = null, ownerSubject) {
    if (!this._ready) return defaultValue
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return defaultValue
    return this.getSetting(scopedSettingKey(key, owner), defaultValue)
  },

  setUserSetting (key, value, ownerSubject) {
    if (!this._ready) return
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return
    this.setSetting(scopedSettingKey(key, owner), value)
  },
}
