/**
 * Store �?统一数据存储（SQLite, sql.js via sqlite-wrapper�? *
 * 替代零散 JSONL 文件，统一管理�? *   - accounts    账号信息（Cookie/localStorage/账号名）
 *   - publish_history  发布历史
 *   - scheduled_tasks  定时任务
 *   - settings    应用设置
 *   - callback_logs    回调日志（评�?通知等）
 *
 * 文件路径: {userData}/multi-publish.db
 */
const path = require('path')
const { app } = require('electron')
const { TABLE_NAMES, SCHEMA_SQL, safeJsonParse, safeJsonStringify, buildUpdateQuery } = require('./store-schema')
const log = require('./logger')

let Database = null
try {
  Database = require('./sqlite-wrapper')
} catch (e) {
  log.error('Store', `sql.js failed to load: ${e.message}`)
}

class Store {
  constructor () {
    this.db = null
    this._ready = false
  }

  /**
   * 初始化数据库（应用启动时调用�?   */
  init () {
    if (this._ready) return true
    if (!Database) {
      log.warn('Store', 'sql.js not available, store disabled')
      return false
    }

    const dbPath = path.join(app.getPath('userData'), 'multi-publish.db')
    log.info('Store', `Opening database: ${dbPath}`)

    try {
      this.db = new Database(dbPath)
      this.db.pragma('journal_mode = WAL')   // WAL 模式，读写不阻塞
      this.db.pragma('foreign_keys = ON')
      this._createTables()
      this._ready = true
      log.info('Store', 'Database initialized successfully')
      return true
    } catch (e) {
      log.error('Store', `Failed to initialize: ${e.message}`)
      return false
    }
  }

  _createTables () {
    for (const sql of SCHEMA_SQL) {
      this.db.exec(sql)
    }
  }

  // ─── 账号 ──────────────────────────────────────

  addAccount (account) {
    if (!this._ready) return false
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO accounts (id, platform, name, avatar, cookies, localStorage, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    stmt.run(
      account.id,
      account.platform,
      account.name || '',
      account.avatar || '',
      JSON.stringify(account.cookies || []),
      JSON.stringify(account.localStorage || {}),
      account.status || 'active',
    )
    return true
  }

  getAccount (id) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    if (!row) return null
    return this._parseAccount(row)
  }

  listAccounts (platform) {
    if (!this._ready) return []
    const sql = platform
      ? this.db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC')
      : this.db.prepare('SELECT * FROM accounts ORDER BY platform, created_at DESC')
    const rows = platform ? sql.all(platform) : sql.all()
    return rows.map(r => this._parseAccount(r))
  }

  deleteAccount (id) {
    if (!this._ready) return false
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    return true
  }

  updateAccount (id, fields) {
    if (!this._ready) return false
    const sets = []
    const vals = []
    for (const [k, v] of Object.entries(fields)) {
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
    this.db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  }

  /**
   * 设置平台的默认账�?   */
  setDefaultAccount (platform, accountId) {
    if (!this._ready) return false
    // 清除该平台所有账号的默认标记
    this.db.prepare('UPDATE accounts SET is_default = 0 WHERE platform = ?').run(platform)
    // 设置新的默认账号
    this.db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(accountId)
    return true
  }

  _parseAccount (row) {
    try { row.cookies = JSON.parse(row.cookies) } catch (e) { row.cookies = [] }
    row.localStorage = safeJsonParse(row.localStorage, {})
    return row
  }

  /**
   * 获取平台的默认账�?   */
  getDefaultAccount (platform) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM accounts WHERE platform = ? AND is_default = 1 LIMIT 1').get(platform)
    if (!row) {
      // 没有默认账号，返回第一�?      const first = this.db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC LIMIT 1').get(platform)
      return first ? this._parseAccount(first) : null
    }
    return this._parseAccount(row)
  }

  // ─── 发布历史 ────────────────────────────────

  addPublishRecord (record) {
    if (!this._ready) return null
    const id = record.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO publish_history (id, platform, title, content, task_id, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      record.platform || '',
      record.title || '',
      record.content || '',
      record.task_id || '',
      record.status || 'pending',
      JSON.stringify(record.result || {}),
      record.error || '',
    )
    return id
  }

  listPublishHistory (opts = {}) {
    if (!this._ready) return { total: 0, records: [] }
    const { platform, limit = 50, offset = 0 } = opts
    let sql = 'SELECT * FROM publish_history'
    let countSql = 'SELECT COUNT(*) AS total FROM publish_history'
    const params = []

    if (platform) {
      sql += ' WHERE platform = ?'
      countSql += ' WHERE platform = ?'
      params.push(platform)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const total = this.db.prepare(countSql).get(...(platform ? [platform] : [])).total
    const records = this.db.prepare(sql).all(...params)
    return { total, records: records.map(r => ({ ...r, result: this._safeJson(r.result) })) }
  }

  getPublishStats () {
    if (!this._ready) return { total: 0, success: 0, failed: 0, byPlatform: {} }
    const all = this.db.prepare('SELECT platform, status FROM publish_history').all()
    const stats = { total: all.length, success: 0, failed: 0, byPlatform: {} }

    for (const r of all) {
      if (r.status === 'success') stats.success++
      if (r.status === 'failed') stats.failed++
      if (!stats.byPlatform[r.platform]) stats.byPlatform[r.platform] = { total: 0, success: 0, failed: 0 }
      stats.byPlatform[r.platform].total++
      if (r.status === 'success') stats.byPlatform[r.platform].success++
      if (r.status === 'failed') stats.byPlatform[r.platform].failed++
    }
    return stats
  }

  // ─── 定时任务 ────────────────────────────────

  addScheduledTask (task) {
    if (!this._ready) return null
    const id = task.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
    this.db.prepare(`
      INSERT OR REPLACE INTO scheduled_tasks (id, platform, article, publish_time, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, task.platform, JSON.stringify(task.article || {}), task.publish_time, task.status || 'pending')
    return id
  }

  listScheduledTasks () {
    if (!this._ready) return []
    return this.db.prepare('SELECT * FROM scheduled_tasks ORDER BY publish_time ASC').all().map(r => ({
      ...r,
      article: this._safeJson(r.article),
    }))
  }

  getPendingTasks () {
    if (!this._ready) return []
    return this.db.prepare(
      "SELECT * FROM scheduled_tasks WHERE status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC"
    ).all().map(r => ({ ...r, article: this._safeJson(r.article) }))
  }

  updateTaskStatus (id, status) {
    if (!this._ready) return false
    this.db.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, id)
    return true
  }

  deleteTask (id) {
    if (!this._ready) return false
    this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
    return true
  }

  // ─── 设置 ──────────────────────────────────────

  getSetting (key, defaultValue = null) {
    if (!this._ready) return defaultValue
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return defaultValue
    return safeJsonParse(row.value, row.value)
  }

  setSetting (key, value) {
    if (!this._ready) return
    const str = safeJsonStringify(value)
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, str)
  }

  // ─── 回调日志 ────────────────────────────────

  addCallbackLog (type, source, payload) {
    if (!this._ready) return
    this.db.prepare(
      'INSERT INTO callback_logs (type, source, payload) VALUES (?, ?, ?)'
    ).run(type, source || '', JSON.stringify(payload || {}))
  }

  listCallbackLogs (limit = 50) {
    if (!this._ready) return []
    return this.db.prepare(
      'SELECT * FROM callback_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit).map(r => ({ ...r, payload: this._safeJson(r.payload) }))
  }

  // ─── 工具 ────────────────────────────────────

  // ─── 批量任务 ────────────────────────────────

  addBatchJob (job) {
    if (!this._ready) return false
    this.db.prepare(`
      INSERT OR REPLACE INTO batch_jobs (id, name, articles, total, completed, failed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.name, JSON.stringify(job.articles || []), job.total, job.completed || 0, job.failed || 0, job.status || 'pending')
    return true
  }

  getBatchJob (id) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(id)
    if (!row) return null
    row.articles = safeJsonParse(row.articles, [])
    return row
  }

  listBatchJobs () {
    if (!this._ready) return []
    return this.db.prepare('SELECT * FROM batch_jobs ORDER BY created_at DESC').all().map(r => {
      try { r.articles = JSON.parse(r.articles) } catch (e) { r.articles = [] }
      return r
    })
  }

  updateBatchJob (id, fields) {
    if (!this._ready) return false
    const { sets, vals } = buildUpdateQuery(fields);
    vals.push(id)
    this.db.prepare(`UPDATE batch_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  }

  deleteBatchJob (id) {
    if (!this._ready) return false
    this.db.prepare('DELETE FROM batch_jobs WHERE id = ?').run(id)
    return true
  }

  // ─── 发布频率控制 ─────────────────────────
  /**
   * 获取指定平台+账号的最后发布时�?   * @param {string} key - "${platform}:${accountId}"
   * @returns {number|null} 时间�?(ms)，null 表示从未发布
   */
  getPublishTimeline (key) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT last_publish_at FROM publish_timeline WHERE key = ?').get(key)
    return row ? row.last_publish_at : null
  }

  /**
   * 设置指定平台+账号的最后发布时�?   * @param {string} key - "${platform}:${accountId}"
   * @param {number} timestamp - 时间�?(ms)
   */
  setPublishTimeline (key, timestamp) {
    if (!this._ready) return
    this.db.prepare(
      'INSERT OR REPLACE INTO publish_timeline (key, last_publish_at) VALUES (?, ?)'
    ).run(key, timestamp)
  }

  _safeJson (str) {
    try { return JSON.parse(str) } catch (e) { return str }
  }

  /**
   * 关闭数据�?   */
  close () {
    if (this.db) {
      try { this.db.close() } catch (e) { /* ignore */ }
      this.db = null
      this._ready = false
    }
  }
}

module.exports = Store
