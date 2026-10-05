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

  /**
   * 按「对象」语义读回设置值 — 消费方的唯一入口。
   *
   * `getSetting` 返回的是**解析后的值**（不是字符串），因此"取回来再 JSON.parse"的写法
   * 会把对象 stringify 成 `[object Object]` 后解析失败，静默退化成空配置。
   * 存量行（历史上以 JSON 文本写入）经 `getSetting` 已解析为对象，故无需迁移。
   * 损坏行与非对象值一律回落调用方声明的默认值（缺席/损坏都不是错误）。
   * 两条边界：① 回落分支返回的是**调用方传入 defaultValue 的本体引用**，请勿原地修改，也不要把模块级常量当默认值传入；
   *    ② 数组型值（drafts / automation_tasks 等）被 !Array.isArray 判据**主动排除**，不在本入口覆盖范围，
   *    它们仍走各自的同形判据；把数组消费点迁到本入口会把有数据读成空对象（比不迁更坏）。
   *    口径与待收敛清单见 docs/settings-persistence-contract.md §2/§6。
   */
  getSettingObject (key, defaultValue = {}) {
    const raw = this.getSetting(key, null)
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch { /* 非法 JSON 按无配置处理 */ }
    }
    return defaultValue
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
