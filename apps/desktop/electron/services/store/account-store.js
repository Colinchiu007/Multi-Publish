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
const { sanitizeUpdateFields, safeJsonParse } = require('../store-schema')

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
  addAccount (account) {
    if (!this._ready) return false
    if (!account || typeof account !== 'object' || Array.isArray(account)) return false
    if (typeof account.platform !== 'string' || !account.platform.trim()) return false
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO accounts (id, platform, name, avatar, cookies, localStorage, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    stmt.run(
      account.id ?? null,
      account.platform,
      account.name || '',
      account.avatar || '',
      JSON.stringify(account.cookies || []),
      JSON.stringify(account.localStorage || {}),
      account.status || 'active',
    )
    return true
  },

  getAccount (id) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    if (!row) return null
    return this._parseAccount(row)
  },

  listAccounts (platform) {
    if (!this._ready) return []
    const sql = platform
      ? this.db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC')
      : this.db.prepare('SELECT * FROM accounts ORDER BY platform, created_at DESC')
    const rows = platform ? sql.all(platform) : sql.all()
    return rows.map(r => this._parseAccount(r))
  },

  deleteAccount (id) {
    if (!this._ready) return false
    const tx = this.db.transaction(() => {
      const row = this.db.prepare('SELECT platform FROM accounts WHERE id = ?').get(id)
      const platform = row ? row.platform : null
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
      if (!platform) return

      const scheduledTasks = this.db
        .prepare('SELECT id, article FROM scheduled_tasks WHERE platform = ?')
        .all(platform)
      for (const task of scheduledTasks) {
        if (jsonReferencesAccountId(task.article, id)) {
          this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(task.id)
        }
      }

      const historyRows = this.db
        .prepare('SELECT id, result FROM publish_history WHERE platform = ?')
        .all(platform)
      for (const history of historyRows) {
        if (jsonReferencesAccountId(history.result, id)) {
          this.db.prepare('DELETE FROM publish_history WHERE id = ?').run(history.id)
        }
      }

      const defaultKey = `default_account:${platform}`
      const defaultSetting = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(defaultKey)
      const defaultAccountId = defaultSetting
        ? safeJsonParse(defaultSetting.value, defaultSetting.value)
        : null
      if (defaultAccountId !== null && String(defaultAccountId) === String(id)) {
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(defaultKey)
      }
    })
    tx()
    // 触发持久化
    if (this.db.persist) this.db.persist()
    return true
  },

  updateAccount (id, fields) {
    if (!this._ready) return false
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
    vals.push(id)
    const result = this.db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return Boolean(result && result.changes > 0)
  },

  /**
   * 设置平台的默认账号（事务包裹，保证原子性）
   */
  setDefaultAccount (platform, accountId) {
    if (!this._ready) return false
    if (!platform || accountId === null || accountId === undefined || accountId === '') return false
    const account = this.db.prepare('SELECT id FROM accounts WHERE id = ? AND platform = ?').get(accountId, platform)
    if (!account) return false
    // 安全：事务包裹两条 UPDATE，防止中间失败导致数据不一致
    const tx = this.db.transaction(() => {
      // 清除该平台所有账号的默认标记
      this.db.prepare('UPDATE accounts SET is_default = 0 WHERE platform = ?').run(platform)
      // 设置新的默认账号
      this.db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ? AND platform = ?').run(accountId, platform)
    })
    tx()
    return true
  },

  _parseAccount (row) {
    // eslint-disable-next-line no-unused-vars
    try { row.cookies = JSON.parse(row.cookies) } catch (e) { row.cookies = [] }
    row.localStorage = safeJsonParse(row.localStorage, {})
    return row
  },

  /**
   * 获取平台的默认账号
   */
  getDefaultAccount (platform) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE platform = ? AND is_default = 1 LIMIT 1').get(platform)
    if (!row) {
      // 没有默认账号，返回第一个
      const first = this.db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC LIMIT 1').get(platform)
      return first ? this._parseAccount(first) : null
    }
    return this._parseAccount(row)
  },
}
