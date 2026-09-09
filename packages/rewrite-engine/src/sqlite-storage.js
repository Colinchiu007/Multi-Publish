/**
 * SQLiteStorage — KnowledgeBase 的 SQLite 持久化适配器
 *
 * 实现 { get(key), set(key, value) } 接口，与 MemoryStorage 行为一致。
 * 适配器不直接依赖 sql.js / sqlite-wrapper，而是接收一个 db 对象，
 * 由调用方注入具体实现。
 *
 * 存储表结构：
 *   CREATE TABLE IF NOT EXISTS rewrite_engine_kv (
 *     key   TEXT PRIMARY KEY,
 *     value TEXT NOT NULL
 *   )
 */

'use strict'

function ensureTable(db) {
  if (!db) return
  try {
    db.prepare(
      'CREATE TABLE IF NOT EXISTS rewrite_engine_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    ).run()
  } catch (_) { /* 降级 */ }
}

class SQLiteStorage {
  constructor(db) {
    this._db = db || null
    this._ready = false
    if (this._db) {
      ensureTable(this._db)
      this._ready = true
    }
  }

  setDb(db) {
    this._db = db || null
    if (this._db) {
      ensureTable(this._db)
      this._ready = true
    } else {
      this._ready = false
    }
  }

  isReady() { return this._ready && !!this._db }

  get(key) {
    if (!this._ready || !this._db) return null
    try {
      var row = this._db.prepare('SELECT value FROM rewrite_engine_kv WHERE key = ?').get(key)
      return row && row.value ? row.value : null
    } catch (_) { return null }
  }

  set(key, value) {
    if (!this._ready || !this._db) return
    try {
      this._db.prepare('INSERT OR REPLACE INTO rewrite_engine_kv (key, value) VALUES (?, ?)').run(key, value)
    } catch (_) { /* 降级 */ }
  }
}

module.exports = { SQLiteStorage }
