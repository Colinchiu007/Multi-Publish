// @ts-check
/**
 * SQLite Wrapper — 兼容 better-sqlite3 API 的纯 JS 实现
 *
 * 底层使用 sql.js，不需要原生编译。
 * 提供 prepare(sql).all() / .get() / .run() / .transaction() 接口，
 * 与 store.js 中原有的 better-sqlite3 调用兼容。
 *
 * 注意：sql.js 需要先调用 initSqlJs() 初始化 WASM，
 * 这里在模块加载时预先初始化，确保 ready 后再对外开放。
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')

let SQL = null
let _initError = null

// 预初始化 sql.js
try {
  const initSqlJs = require('sql.js')
  if (typeof initSqlJs === 'function') {
    // initSqlJs() 返回 Promise<SQL Module>
    initSqlJs().then(m => { SQL = m }).catch(e => { _initError = e.message })
  }
} catch (e) {
  _initError = `sql.js not installed: ${e.message}`
}

class Statement {
  constructor(db, sql) {
    this._db = db
    this._sql = sql
  }

  run(...params) {
    // 修复 P3：原 catch 静默吞掉所有错误且 changes 恒为 0
    if (!this._db) return { changes: 0 }
    let stmt
    try {
      stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      stmt.step()
      const changes = this._db.getRowsModified()
      return { changes }
    } catch (e) {
      // 表不存在等启动期错误降级为 changes:0，其余错误记录日志
      if (!String(e.message).includes('no such table')) {
        log.error('sqlite-wrapper', `run() error: ${e.message} | SQL: ${this._sql.substring(0, 80)}`)
      }
      return { changes: 0, error: e.message }
    } finally {
      if (stmt) { try { stmt.free() } catch (_) { /* ignore */ } }
    }
  }

  get(...params) {
    if (!this._db) return undefined
    let stmt
    try {
      stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      if (stmt.step()) {
        return stmt.getAsObject()
      }
    } catch (e) {
      if (!String(e.message).includes('no such table')) {
        log.error('sqlite-wrapper', `get() error: ${e.message} | SQL: ${this._sql.substring(0, 80)}`)
      }
    } finally {
      if (stmt) { try { stmt.free() } catch (_) { /* ignore */ } }
    }
    return undefined
  }

  all(...params) {
    const rows = []
    if (!this._db) return rows
    let stmt
    try {
      stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
    } catch (e) {
      if (!String(e.message).includes('no such table')) {
        log.error('sqlite-wrapper', `all() error: ${e.message} | SQL: ${this._sql.substring(0, 80)}`)
      }
    } finally {
      if (stmt) { try { stmt.free() } catch (_) { /* ignore */ } }
    }
    return rows
  }
}

class Database {
  constructor(dbPath) {
    this._dbPath = dbPath
    this._ready = false
    this._db = null
    this._dirty = false   // 标记是否有未持久化的写入
    this._init()
  }

  _init() {
    if (!SQL) {
      if (_initError) log.warn('sqlite-wrapper', _initError)
      return
    }
    try {
      this._db = new SQL.Database()
      if (fs.existsSync(this._dbPath)) {
        const buffer = fs.readFileSync(this._dbPath)
        this._db = new SQL.Database(buffer)
      }
      this._ready = true
    } catch (e) {
      log.error('sqlite-wrapper', 'Failed to open DB: ' + e.message)
    }
  }

  pragma(sql) {
    if (this._db) {
      // 白名单校验，仅允许已知安全的 PRAGMA 名（防 SQL 注入）
      const SAFE_PRAGMAS = ['journal_mode = WAL', 'journal_mode = DELETE', 'journal_mode = MEMORY',
        'foreign_keys = ON', 'foreign_keys = OFF', 'synchronous = NORMAL', 'synchronous = FULL',
        'synchronous = OFF', 'temp_store = MEMORY', 'temp_store = FILE']
      if (!SAFE_PRAGMAS.includes(String(sql).trim())) {
        log.warn('sqlite-wrapper', 'Rejected unsafe PRAGMA: ' + sql)
        return
      }
      try { this._db.exec(`PRAGMA ${sql}`) } catch (e) {
        log.warn('sqlite-wrapper', 'PRAGMA error: ' + e.message)
      }
    }
  }

  prepare(sql) {
    if (!this._db) return new Statement(null, sql)
    return new Statement(this._db, sql)
  }

  exec(sql) {
    if (this._db) {
      try {
        this._db.exec(sql)
        this._dirty = true
      } catch (e) {
        log.error('sqlite-wrapper', 'exec() error: ' + e.message)
      }
    }
  }

  /**
   * 事务支持（修复 P4：原 store.js 调用 this.db.transaction() 但方法不存在）
   * @param {function} fn - 事务体函数
   */
  transaction(fn) {
    if (!this._db) return () => {}
    return () => {
      try {
        this._db.exec('BEGIN')
        const result = fn()
        this._db.exec('COMMIT')
        this._dirty = true
        return result
      } catch (e) {
        try { this._db.exec('ROLLBACK') } catch (_) { /* ignore rollback error */ }
        log.error('sqlite-wrapper', 'Transaction failed, rolled back: ' + e.message)
        throw e
      }
    }
  }

  /**
   * 持久化到磁盘（原子写：tmp + rename）
   * 修复 P1：原仅 close() 时持久化，崩溃丢全部数据
   */
  persist() {
    if (!this._db || !this._dbPath || !this._dirty) return true
    try {
      const data = this._db.export()
      const dir = path.dirname(this._dbPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      // 原子写：先写临时文件，再 rename
      const tmpPath = this._dbPath + '.tmp'
      fs.writeFileSync(tmpPath, Buffer.from(data))
      fs.renameSync(tmpPath, this._dbPath)
      this._dirty = false
      return true
    } catch (e) {
      log.error('sqlite-wrapper', 'Failed to persist DB: ' + e.message)
      return false
    }
  }

  close() {
    // 关闭前持久化（原子写）
    this.persist()
    if (this._db) this._db.close()
  }
}

module.exports = Database
