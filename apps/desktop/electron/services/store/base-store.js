// @ts-check
/**
 * BaseStore — Store 的基类
 *
 * 承载共享基础设施（db 连接、生命周期、JSON 辅助、JSONL 迁移），
 * 各功能域方法由 store/<domain>-store.js 以 mixin 形式注入 prototype。
 *
 * 文件路径: {userData}/multi-publish.db
 */
const path = require('path')
const { app } = require('electron')
const { SCHEMA_SQL } = require('../store-schema')
const log = require('../logger')

let Database = null
try {
  Database = require('../sqlite-wrapper')
} catch (e) {
  log.error('Store', `sql.js failed to load: ${e.message}`)
}

class BaseStore {
  constructor () {
    this.db = null
    this._ready = false
  }

  /**
   * 初始化数据库（应用启动时调用）
   */
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

  _safeJson (str) {
    // eslint-disable-next-line no-unused-vars
    try { return JSON.parse(str) } catch (e) { return str }
  }

  /**
   * 关闭数据库
   */
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
}

module.exports = BaseStore
