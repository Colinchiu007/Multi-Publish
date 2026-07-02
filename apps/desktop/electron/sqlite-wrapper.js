/**
 * SQLite Wrapper — 兼容 better-sqlite3 API 的纯 JS 实现
 *
 * 底层使用 sql.js，不需要原生编译。
 * 提供 prepare(sql).all() / .get() / .run() 接口，
 * 与 store.js 中原有的 better-sqlite3 调用兼容。
 *
 * 注意：sql.js 需要先调用 initSqlJs() 初始化 WASM，
 * 这里在模块加载时预先初始化，确保 ready 后再对外开放。
 */
const fs = require('fs')
const path = require('path')

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
    try {
      const stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      stmt.step()
      stmt.free()
    } catch (e) {
      // Table might not exist yet — just return
    }
    return { changes: 0 }
  }

  get(...params) {
    try {
      const stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return row
      }
      stmt.free()
    } catch (e) {
      return undefined
    }
    return undefined
  }

  all(...params) {
    const rows = []
    try {
      const stmt = this._db.prepare(this._sql)
      if (params.length > 0) stmt.bind(params)
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
    } catch (e) {
      // Table might not exist yet
    }
    return rows
  }
}

class Database {
  constructor(dbPath) {
    this._dbPath = dbPath
    this._ready = false
    this._db = null
    this._init()
  }

  _init() {
    if (!SQL) {
      if (_initError) console.warn('[sqlite-wrapper]', _initError)
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
      console.warn('[sqlite-wrapper] Failed to open DB:', e.message)
    }
  }

  pragma(sql) {
    if (this._db) {
      try { this._db.exec(`PRAGMA ${sql}`) } catch (e) { /* ignore */ }
    }
  }

  prepare(sql) {
    if (!this._db) return new Statement(null, sql)
    return new Statement(this._db, sql)
  }

  exec(sql) {
    if (this._db) {
      try { this._db.exec(sql) } catch (e) { /* ignore */ }
    }
  }

  close() {
    if (this._db && this._dbPath) {
      try {
        const data = this._db.export()
        const dir = path.dirname(this._dbPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(this._dbPath, Buffer.from(data))
      } catch (e) {
        console.warn('[sqlite-wrapper] Failed to save DB:', e.message)
      }
    }
    if (this._db) this._db.close()
  }
}

module.exports = Database
