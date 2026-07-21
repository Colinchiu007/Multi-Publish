// @ts-check
/**
 * account-store — 账号功能域 mixin
 *
 * 通过 Object.assign 注入 Store.prototype，方法内通过 this.db / this._ready
 * 访问 BaseStore 提供的共享状态。
 */
const { sanitizeUpdateFields, safeJsonParse, safeJsonStringify } = require('../store-schema')

function createAccountId () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function assertWriteSucceeded (result, operation, requireChanges = false) {
  if (!result || result.error || (requireChanges && result.changes === 0)) {
    const detail = result && result.error ? `：${result.error}` : ''
    throw new Error(`${operation}失败${detail}`)
  }
}

module.exports = {
  addAccount (account, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner || !account || typeof account !== 'object' || !account.platform) return false
    const id = String(account.id || createAccountId())
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
      account.account_name || '',
      account.name || '',
      account.avatar || '',
      safeJsonStringify(account.cookies || []),
      safeJsonStringify(account.localStorage || {}),
      account.avatar_url || '',
      account.status || 'active',
      account.is_default ? 1 : 0,
    )
    return !result.error && result.changes !== 0
  },

  getAccount (id, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND id = ?')
      .get(owner, String(id))
    if (!row) return null
    return this._parseAccount(row)
  },

  listAccounts (platform, ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    const sql = platform
      ? this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? ORDER BY created_at DESC')
      : this.db.prepare('SELECT * FROM accounts WHERE owner_subject = ? ORDER BY platform, created_at DESC')
    const rows = platform ? sql.all(owner, platform) : sql.all(owner)
    return rows.map(row => this._parseAccount(row))
  },

  deleteAccount (id, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const normalizedId = String(id)
    const row = this.db.prepare('SELECT platform FROM accounts WHERE owner_subject = ? AND id = ?')
      .get(owner, normalizedId)
    if (!row) return false

    try {
      const removeAccount = this.db.transaction(() => {
        const accountResult = this.db.prepare(
          'DELETE FROM accounts WHERE owner_subject = ? AND id = ?',
        ).run(owner, normalizedId)
        assertWriteSucceeded(accountResult, '删除账号', true)

        const taskResult = this.db.prepare(`
          DELETE FROM scheduled_tasks
          WHERE owner_subject = ? AND platform = ?
            AND CASE WHEN json_valid(article)
              THEN json_extract(article, '$.accountId') ELSE NULL END = ?
        `).run(owner, row.platform, normalizedId)
        assertWriteSucceeded(taskResult, '清理账号定时任务')

        const historyResult = this.db.prepare(`
          DELETE FROM publish_history
          WHERE owner_subject = ? AND platform = ?
            AND CASE WHEN json_valid(result)
              THEN json_extract(result, '$.accountId') ELSE NULL END = ?
        `).run(owner, row.platform, normalizedId)
        assertWriteSucceeded(historyResult, '清理账号发布历史')
      })
      removeAccount()
    } catch (_) {
      return false
    }
    if (this.db.persist) this.db.persist()
    return true
  },

  updateAccount (id, fields, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const safeFields = sanitizeUpdateFields('accounts', fields)
    if (Object.keys(safeFields).length === 0) return false
    const sets = []
    const vals = []
    for (const [key, value] of Object.entries(safeFields)) {
      sets.push(`${key} = ?`)
      vals.push(key === 'cookies' || key === 'localStorage' ? safeJsonStringify(value) : value)
    }
    sets.push("updated_at = datetime('now')")
    vals.push(owner, String(id))
    const result = this.db.prepare(
      `UPDATE accounts SET ${sets.join(', ')} WHERE owner_subject = ? AND id = ?`,
    ).run(...vals)
    return !result.error && result.changes !== 0
  },

  /**
   * 设置当前用户在指定平台的默认账号。
   */
  setDefaultAccount (platform, accountId, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const normalizedId = String(accountId)
    const target = this.db.prepare(
      'SELECT id FROM accounts WHERE owner_subject = ? AND platform = ? AND id = ?',
    ).get(owner, platform, normalizedId)
    if (!target) return false

    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE accounts SET is_default = 0 WHERE owner_subject = ? AND platform = ?')
        .run(owner, platform)
      this.db.prepare('UPDATE accounts SET is_default = 1 WHERE owner_subject = ? AND platform = ? AND id = ?')
        .run(owner, platform, normalizedId)
    })
    tx()
    return true
  },

  _parseAccount (row) {
    try { row.cookies = JSON.parse(row.cookies) } catch (e) { row.cookies = [] }
    row.localStorage = safeJsonParse(row.localStorage, {})
    return row
  },

  getDefaultAccount (platform, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return null
    const row = this.db.prepare(
      'SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? AND is_default = 1 LIMIT 1',
    ).get(owner, platform)
    if (row) return this._parseAccount(row)

    const first = this.db.prepare(
      'SELECT * FROM accounts WHERE owner_subject = ? AND platform = ? ORDER BY created_at DESC LIMIT 1',
    ).get(owner, platform)
    return first ? this._parseAccount(first) : null
  },
}
