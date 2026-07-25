// @ts-check
/**
 * account-store — 账号功能域 mixin
 *
 * 通过 Object.assign 注入 Store.prototype，方法内通过 this.db / this._ready
 * 访问 BaseStore 提供的共享状态。
 *
 * 依赖：BaseStore._safeJson（基类提供）
 *       store-schema.sanitizeUpdateFields / safeJsonParse
 */
const {
  sanitizeUpdateFields,
  safeJsonParse,
  LEGACY_OWNER_SUBJECT,
} = require('../store-schema')
const crypto = require('crypto')

class StoreWriteFailure extends Error {}

function resolveOwner (store, explicitOwner) {
  if (typeof store._resolveOwnerSubject === 'function') return store._resolveOwnerSubject(explicitOwner)
  if (explicitOwner === undefined) return LEGACY_OWNER_SUBJECT
  if (typeof explicitOwner !== 'string' || !explicitOwner.trim()) return null
  return explicitOwner.trim()
}

function checkedRun (statement, ...params) {
  const result = statement.run(...params)
  if (result && result.error) throw new StoreWriteFailure(result.error)
  return result
}

function scopedSettingKey (key, owner) {
  if (owner === LEGACY_OWNER_SUBJECT) return key
  const namespace = crypto.createHash('sha256').update(owner, 'utf8').digest('hex')
  return `user:${namespace}:${key}`
}

function nextAccountId (store, owner) {
  const rows = store.db.prepare('SELECT id FROM accounts WHERE owner_subject = ?').all(owner)
  const numericIds = rows
    .map(row => String(row.id))
    .filter(id => /^\d+$/.test(id))
    .map(id => Number(id))
    .filter(Number.isSafeInteger)
  if (numericIds.length > 0) return String(Math.max(...numericIds) + 1)
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function referencesAccountId (value, accountId, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return false
  if (Array.isArray(value)) {
    return value.some(item => referencesAccountId(item, accountId, depth + 1))
  }
  if (typeof value !== 'object') return false
  for (const [key, nestedValue] of Object.entries(value)) {
    if ((key === 'accountId' || key === 'account_id') && String(nestedValue) === String(accountId)) {
      return true
    }
    if (referencesAccountId(nestedValue, accountId, depth + 1)) return true
  }
  return false
}

function jsonReferencesAccountId (json, accountId) {
  if (typeof json !== 'string') return false
  const parsed = safeJsonParse(json, null)
  return parsed && typeof parsed === 'object'
    ? referencesAccountId(parsed, accountId)
    : false
}

module.exports = {
  addAccount (account, ownerSubject) {
    if (!this._ready) return false
    if (!account || typeof account !== 'object' || Array.isArray(account)) return false
    if (typeof account.platform !== 'string' || !account.platform.trim()) return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    const id = account.id === null || account.id === undefined || account.id === ''
      ? nextAccountId(this, owner)
      : String(account.id)
    try {
      const result = this.db.prepare(`
        INSERT OR REPLACE INTO accounts (
          owner_subject, id, platform, account_name, name, avatar, cookies,
          localStorage, avatar_url, status, is_default, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        owner,
        id,
        account.platform,
        account.account_name || account.name || '',
        account.name || '',
        account.avatar || '',
        JSON.stringify(account.cookies || []),
        JSON.stringify(account.localStorage || {}),
        account.avatar_url || '',
        account.status || 'active',
        account.is_default ? 1 : 0,
      )
      return !(result && result.error)
    } catch (_) {
      return false
    }
  },

  getAccount (id, ownerSubject) {
    if (!this._ready) return null
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND id = ?').get(owner, String(id))
    if (!row) return null
    return this._parseAccount(row)
  },

  listAccounts (platform, ownerSubject) {
    if (!this._ready) return []
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return []
    const sql = platform
      ? this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? ORDER BY created_at DESC')
      : this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? ORDER BY platform, created_at DESC')
    const rows = platform ? sql.all(owner, platform) : sql.all(owner)
    return rows.map(r => this._parseAccount(r))
  },

  deleteAccount (id, ownerSubject) {
    if (!this._ready) return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    let writeFailure = false
    const tx = this.db.transaction(() => {
      const row = this.db.prepare('SELECT platform FROM accounts WHERE owner_subject = ? AND id = ?').get(owner, String(id))
      const platform = row ? row.platform : null
      if (!platform) return false
      const deleted = checkedRun(this.db.prepare('DELETE FROM accounts WHERE owner_subject = ? AND id = ?'), owner, String(id))
      if (!deleted || deleted.changes === 0) return false

      const scheduledTasks = this.db
        .prepare('SELECT id, article FROM scheduled_tasks WHERE owner_subject = ? AND platform = ?')
        .all(owner, platform)
      for (const task of scheduledTasks) {
        if (jsonReferencesAccountId(task.article, id)) {
          checkedRun(this.db.prepare('DELETE FROM scheduled_tasks WHERE owner_subject = ? AND id = ?'), owner, task.id)
        }
      }

      const historyRows = this.db
        .prepare('SELECT id, result FROM publish_history WHERE owner_subject = ? AND platform = ?')
        .all(owner, platform)
      for (const history of historyRows) {
        if (jsonReferencesAccountId(history.result, id)) {
          checkedRun(this.db.prepare('DELETE FROM publish_history WHERE owner_subject = ? AND id = ?'), owner, history.id)
        }
      }

      const defaultKey = `default_account:${platform}`
      const settingKey = scopedSettingKey(defaultKey, owner)
      const defaultSetting = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey)
      const defaultAccountId = defaultSetting
        ? safeJsonParse(defaultSetting.value, defaultSetting.value)
        : null
      if (defaultAccountId !== null && String(defaultAccountId) === String(id)) {
        checkedRun(this.db.prepare('DELETE FROM settings WHERE key = ?'), settingKey)
      }
      return true
    })
    try {
      const result = tx()
      if (!result) return false
    } catch (error) {
      if (error instanceof StoreWriteFailure) {
        writeFailure = true
      } else {
        throw error
      }
    }
    if (writeFailure) return false
    // 触发持久化
    if (this.db.persist) this.db.persist()
    return true
  },

  updateAccount (id, fields, ownerSubject) {
    if (!this._ready) return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    // 安全：字段名白名单过滤，防止 SQL 注入（字段名直接拼接进 SQL）
    const safeFields = sanitizeUpdateFields('accounts', fields)
    if (Object.keys(safeFields).length === 0) return false
    const sets = []
    const vals = []
    for (const [k, v] of Object.entries(safeFields)) {
      if (k === 'cookies' || k === 'localStorage') {
        sets.push(`${k} = ?`)
        vals.push(JSON.stringify(v))
      } else {
        sets.push(`${k} = ?`)
        vals.push(v)
      }
    }
    sets.push("updated_at = datetime('now')")
    vals.push(owner, String(id))
    const result = this.db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE owner_subject = ? AND id = ?`).run(...vals)
    return Boolean(result && result.changes > 0)
  },

  /**
   * 设置平台的默认账号（事务包裹，保证原子性）
   */
  setDefaultAccount (platform, accountId, ownerSubject) {
    if (!this._ready) return false
    if (!platform || accountId === null || accountId === undefined || accountId === '') return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    const account = this.db.prepare('SELECT id FROM accounts WHERE owner_subject = ? AND id = ? AND platform = ?').get(owner, String(accountId), platform)
    if (!account) return false
    // 安全：事务包裹两条 UPDATE，防止中间失败导致数据不一致
    const tx = this.db.transaction(() => {
      // 清除该平台所有账号的默认标记
      checkedRun(this.db.prepare('UPDATE accounts SET is_default = 0 WHERE owner_subject = ? AND platform = ?'), owner, platform)
      // 设置新的默认账号
      checkedRun(this.db.prepare('UPDATE accounts SET is_default = 1 WHERE owner_subject = ? AND id = ? AND platform = ?'), owner, String(accountId), platform)
    })
    try { tx() } catch (_) { return false }
    return true
  },

  _parseAccount (row) {
    // eslint-disable-next-line no-unused-vars
    try { row.cookies = JSON.parse(row.cookies) } catch (e) { row.cookies = [] }
    row.localStorage = safeJsonParse(row.localStorage, {})
    if (typeof row.id === 'string' && /^\d+$/.test(row.id) && String(Number(row.id)) === row.id) {
      row.id = Number(row.id)
    }
    return row
  },

  /**
   * 获取平台的默认账号
   */
  getDefaultAccount (platform, ownerSubject) {
    if (!this._ready) return null
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? AND is_default = 1 LIMIT 1').get(owner, platform)
    if (!row) {
      // 没有默认账号，返回第一个
      const first = this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? ORDER BY created_at DESC LIMIT 1').get(owner, platform)
      return first ? this._parseAccount(first) : null
    }
    return this._parseAccount(row)
  },
}
