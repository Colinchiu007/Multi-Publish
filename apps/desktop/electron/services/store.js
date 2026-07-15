// @ts-check
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
// eslint-disable-next-line no-unused-vars
const { TABLE_NAMES, SCHEMA_SQL, safeJsonParse, safeJsonStringify, buildUpdateQuery, sanitizeUpdateFields } = require('./store-schema')
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
      // 修复 P1：定时持久化（原仅 close() 时持久化，崩溃丢全部数据）
      // 每 5 秒检查 dirty 标记，有写入则原子持久化到磁盘
      this._persistTimer = setInterval(() => {
        if (this.db && this.db.persist) this.db.persist()
      }, 5000)
      // unref 让定时器不阻止进程退出
      if (this._persistTimer.unref) this._persistTimer.unref()
      log.info('Store', 'Database initialized successfully (with auto-persist)')
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
    // 修复 P2：级联清理孤儿数据（原仅删 accounts 表，凭证/状态/历史残留）
    // 先查出 platform，用于清理 publish_timeline 等关联数据
    const row = this.db.prepare('SELECT platform FROM accounts WHERE id = ?').get(id)
    const platform = row ? row.platform : null

    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    // 清理关联表数据
    this.db.prepare('DELETE FROM scheduled_tasks WHERE platform = ? AND article LIKE ?').run(
      platform || '', `%"accountId":"${id}"%`
    )
    this.db.prepare('DELETE FROM publish_history WHERE platform = ? AND result LIKE ?').run(
      platform || '', `%"accountId":"${id}"%`
    )
    this.db.prepare("DELETE FROM settings WHERE key = ? OR key LIKE ?").run(
      `default_account:${platform}`, `%:${id}`
    )
    // 触发持久化
    if (this.db.persist) this.db.persist()
    return true
  }

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
    this.db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  }

  /**
   * 设置平台的默认账号（事务包裹，保证原子性）
   */
  setDefaultAccount (platform, accountId) {
    if (!this._ready) return false
    // 安全：事务包裹两条 UPDATE，防止中间失败导致数据不一致
    const tx = this.db.transaction(() => {
      // 清除该平台所有账号的默认标记
      this.db.prepare('UPDATE accounts SET is_default = 0 WHERE platform = ?').run(platform)
      // 设置新的默认账号
      this.db.prepare('UPDATE accounts SET is_default = 1 WHERE id = ?').run(accountId)
    })
    tx()
    return true
  }

  _parseAccount (row) {
    // eslint-disable-next-line no-unused-vars
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
      // 没有默认账号，返回第一�?
      const first = this.db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC LIMIT 1').get(platform)
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
      // eslint-disable-next-line no-unused-vars
      try { r.articles = JSON.parse(r.articles) } catch (e) { r.articles = [] }
      return r
    })
  }

  updateBatchJob (id, fields) {
    if (!this._ready) return false
    // 安全：字段名白名单过滤，防止 SQL 注入
    const safeFields = sanitizeUpdateFields('batch_jobs', fields)
    if (Object.keys(safeFields).length === 0) return false
    const { sets, vals } = buildUpdateQuery(safeFields);
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
    // eslint-disable-next-line no-unused-vars
    try { return JSON.parse(str) } catch (e) { return str }
  }

  /**
   * 关闭数据�?   */
  close () {
    if (this._persistTimer) {
      clearInterval(this._persistTimer)
      this._persistTimer = null
    }
    if (this.db) {
      // close() 内部会调用 persist() 做最后一次原子持久化
      // eslint-disable-next-line no-unused-vars
      try { this.db.close() } catch (e) { /* ignore */ }
      this.db = null
      this._ready = false
    }
  }

  /**
   * PRD F8.5: 从 JSONL 文件迁移数据到 SQLite
   * @param {object} paths - { accounts, scheduledTasks, publishHistory } JSONL 文件路径
   * @returns {Promise<{accounts:number, scheduledTasks:number, publishHistory:number}>}
   */
  async migrateFromJsonl (paths) {
    if (!this._ready) throw new Error('Store not ready')
    if (!paths || typeof paths !== 'object') throw new Error('paths required')

    const fs = require('fs')
    const result = { accounts: 0, scheduledTasks: 0, publishHistory: 0 }

    // accounts.jsonl
    if (paths.accounts && fs.existsSync(paths.accounts)) {
      const lines = fs.readFileSync(paths.accounts, 'utf-8').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const a = JSON.parse(line)
          // 跳过已存在的（platform + account_name 唯一）
          const existing = this.db.prepare('SELECT id FROM accounts WHERE platform = ? AND account_name = ?').get(a.platform, a.account_name || '')
          if (!existing) {
            this.addAccount({
              platform: a.platform,
              account_name: a.account_name || '',
              name: a.name || '',
              avatar: a.avatar || '',
              cookies: JSON.stringify(a.cookies || []),
              localStorage: JSON.stringify(a.localStorage || {}),
              status: a.status || 'active',
              is_default: a.is_default ? 1 : 0,
            })
            result.accounts++
          }
        } catch (e) { log.warn('Store', 'migrate account skip: ' + e.message) }
      }
    }

    // scheduled-tasks.jsonl → scheduled_tasks 表
    if (paths.scheduledTasks && fs.existsSync(paths.scheduledTasks)) {
      const lines = fs.readFileSync(paths.scheduledTasks, 'utf-8').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const t = JSON.parse(line)
          this.db.prepare('INSERT OR IGNORE INTO scheduled_tasks (platform, article, publish_time, status) VALUES (?, ?, ?, ?)')
            .run(t.platform, JSON.stringify(t.article || {}), t.publishTime || '', t.status || 'pending')
          result.scheduledTasks++
        } catch (e) { log.warn('Store', 'migrate scheduled_task skip: ' + e.message) }
      }
    }

    // publish-history.jsonl → publish_history 表
    if (paths.publishHistory && fs.existsSync(paths.publishHistory)) {
      const lines = fs.readFileSync(paths.publishHistory, 'utf-8').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const h = JSON.parse(line)
          this.db.prepare('INSERT OR IGNORE INTO publish_history (platform, title, content, status, result) VALUES (?, ?, ?, ?, ?)')
            .run(h.platform || '', h.title || '', h.content || '', h.status || '', h.result || '')
          result.publishHistory++
        } catch (e) { log.warn('Store', 'migrate publish_history skip: ' + e.message) }
      }
    }

    log.info('Store', 'JSONL → SQLite 迁移完成: ' + JSON.stringify(result))
    return result
  }

  // ─── 模型供应商调用日志（Phase 2+）──────────────

  /**
   * 写入模型供应商调用日志
   * @param {object} entry - 日志条目
   * @param {string} entry.provider_id - 供应商 ID（必填）
   * @param {string} entry.category - 类别 llm/tts/image/video/audio（必填）
   * @param {string} entry.action - 动作 chat/tts/image/video/test（必填）
   * @param {string} entry.status - 状态 success/error/timeout（必填）
   * @param {string} [entry.model] - 模型名
   * @param {number} [entry.latency_ms] - 延迟毫秒
   * @param {number} [entry.tokens_in] - 输入 token 数
   * @param {number} [entry.tokens_out] - 输出 token 数
   * @param {number} [entry.cost] - 调用成本
   * @param {string} [entry.error_message] - 错误消息
   * @returns {boolean} 写入成功返回 true，store 未就绪返回 false
   */
  addProviderLog (entry) {
    if (!this._ready) return false
    if (!entry || !entry.provider_id || !entry.category || !entry.action || !entry.status) {
      log.warn('Store', 'addProviderLog: missing required fields')
      return false
    }
    try {
      this.db.prepare(`
        INSERT INTO model_provider_logs
          (provider_id, category, model, action, status, latency_ms, tokens_in, tokens_out, cost, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.provider_id,
        entry.category,
        entry.model || null,
        entry.action,
        entry.status,
        entry.latency_ms != null ? entry.latency_ms : null,
        entry.tokens_in != null ? entry.tokens_in : null,
        entry.tokens_out != null ? entry.tokens_out : null,
        entry.cost != null ? entry.cost : null,
        entry.error_message || null,
      )
      return true
    } catch (e) {
      log.warn('Store', 'addProviderLog failed: ' + e.message)
      return false
    }
  }

  /**
   * 查询模型供应商调用日志
   * @param {object} [filter={}] - 过滤条件
   * @param {string} [filter.provider_id] - 按供应商 ID 过滤
   * @param {string} [filter.category] - 按类别过滤
   * @param {string} [filter.status] - 按状态过滤
   * @param {number} [filter.limit=100] - 返回条数上限
   * @returns {Array} 日志记录数组，store 未就绪返回空数组
   */
  getProviderLogs (filter = {}) {
    if (!this._ready) return []
    const { provider_id, category, status, limit = 100 } = filter
    const conditions = []
    const params = []
    if (provider_id) { conditions.push('provider_id = ?'); params.push(provider_id) }
    if (category) { conditions.push('category = ?'); params.push(category) }
    if (status) { conditions.push('status = ?'); params.push(status) }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const sql = `SELECT * FROM model_provider_logs ${whereClause} ORDER BY created_at DESC LIMIT ?`
    params.push(limit)
    try {
      return this.db.prepare(sql).all(...params)
    } catch (e) {
      log.warn('Store', 'getProviderLogs failed: ' + e.message)
      return []
    }
  }

  /**
   * 清理指定天数前的调用日志
   * @param {number} [days=30] - 保留最近 N 天的日志
   * @returns {number} 删除的行数，store 未就绪返回 0
   */
  cleanProviderLogs (days = 30) {
    if (!this._ready) return 0
    try {
      const result = this.db.prepare(
        `DELETE FROM model_provider_logs WHERE created_at < datetime('now', ?)`
      ).run(`-${days} days`)
      return result.changes || 0
    } catch (e) {
      log.warn('Store', 'cleanProviderLogs failed: ' + e.message)
      return 0
    }
  }
}

module.exports = Store
