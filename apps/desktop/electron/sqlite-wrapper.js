/**
 * SQLite Wrapper — 兼容 better-sqlite3 API 的纯 JS 实现
 *
 * 底层使用 sql.js，不需要原生编译。
 * 提供 prepare(sql).all() / .get() / .run() 接口，
 * 与 store.js 中原有的 better-sqlite3 调用兼容。
 */
const fs = require('fs')
let initSqlJs

try {
  initSqlJs = require('sql.js')
} catch (e) {
  // sql.js not installed — fallback
}

class Statement {
  constructor(db, sql) {
    this._db = db
    this._sql = sql
    this._stmt = null
  }

  _ensure() {
    if (!this._stmt) this._stmt = this._db.prepare(this._sql)
    return this._stmt
  }

  run(...params) {
    const stmt = this._ensure()
    if (params.length > 0) stmt.bind(params)
    stmt.step()
    stmt.free()
    this._stmt = null
    return { changes: this._db.getRowsModified() }
  }

  get(...params) {
    const stmt = this._ensure()
    if (params.length > 0) stmt.bind(params)
    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()
      this._stmt = null
      return row
    }
    stmt.free()
    this._stmt = null
    return undefined
  }

  all(...params) {
    const stmt = this._ensure()
    if (params.length > 0) stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    this._stmt = null
    return rows
  }
}

class Database {
  constructor(dbPath) {
    this._dbPath = dbPath
    this._opened = false

    if (!initSqlJs) {
      console.warn('[sqlite-wrapper] sql.js not available')
      return
    }

    const SQL = initSqlJs()
    this._db = null
    this._ready = false

    // sql.js init is async, but better-sqlite3 constructor is sync
    // We handle this by loading synchronously
    SQL.then((sqlModule) => {
      try {
        if (fs.existsSync(dbPath)) {
          const buffer = fs.readFileSync(dbPath)
          this._db = new sqlModule.Database(buffer)
        } else {
          this._db = new sqlModule.Database()
        }
        this._ready = true
        this._opened = true
      } catch (e) {
        console.warn('[sqlite-wrapper] Failed to open DB:', e.message)
      }
    })
  }

  _wait() {
    // Spin until _ready (sql.js init is async but usually completes same tick)
    if (!this._ready) {
      // Force synchronous init
      const sqlModule = require('sql.js')
      try {
        if (fs.existsSync(this._dbPath)) {
          const buffer = fs.readFileSync(this._dbPath)
          this._db = new sqlModule.Database(buffer)
        } else {
          this._db = new sqlModule.Database()
        }
        this._ready = true
        this._opened = true
      } catch (e) {
        console.warn('[sqlite-wrapper] Failed to open DB:', e.message)
      }
    }
  }

  prepare(sql) {
    this._wait()
    return new Statement(this._db, sql)
  }

  pragma(sql) {
    this._wait()
    this._db.exec(`PRAGMA ${sql}`)
  }

  close() {
    if (this._db && this._dbPath) {
      try {
        const data = this._db.export()
        const dir = require('path').dirname(this._dbPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(this._dbPath, Buffer.from(data))
      } catch (e) {
        console.warn('[sqlite-wrapper] Failed to save DB:', e.message)
      }
    }
    if (this._db) this._db.close()
  }

  // batch execute multiple SQL statements (for CREATE TABLE)
  exec(sql) {
    this._wait()
    this._db.exec(sql)
  }
}

module.exports = Database
