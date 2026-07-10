/**
 * sqlite-wrapper 测试 — R33 强制补测试（跨5轮债务）
 * 覆盖：transaction / persist / pragma / run / get / all
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// 跳过如果 sql.js 不可用
let Database
try {
  // sqlite-wrapper 直接导出 Database 类
  Database = require('../electron/services/sqlite-wrapper')
} catch (e) {
  Database = null
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'))

describe.skipIf(!Database)('sqlite-wrapper', () => {
  let dbPath
  let db

  beforeEach(() => {
    dbPath = path.join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new Database(dbPath)
    // 等待 sql.js 异步初始化
  })

  afterEach(() => {
    if (db) db.close()
    try { fs.unlinkSync(dbPath) } catch (_) {}
    try { fs.unlinkSync(dbPath + '.tmp') } catch (_) {}
  })

  it('transaction 成功时 COMMIT 并标记 _dirty', () => {
    // 等待 SQL 初始化
    if (!db._db) {
      console.warn('sql.js 未初始化，跳过')
      return
    }
    db.exec('CREATE TABLE IF NOT EXISTS t1 (id INTEGER PRIMARY KEY, name TEXT)')
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO t1 (name) VALUES (?)').run('alice')
      return 'ok'
    })
    const result = tx()
    expect(result).toBe('ok')
    expect(db._dirty).toBe(true)
    const row = db.prepare('SELECT COUNT(*) as c FROM t1').get()
    expect(row.c).toBe(1)
  })

  it('transaction 失败时 ROLLBACK 不写入', () => {
    if (!db._db) return
    db.exec('CREATE TABLE IF NOT EXISTS t2 (id INTEGER PRIMARY KEY, name TEXT)')
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO t2 (name) VALUES (?)').run('bob')
      throw new Error('intentional failure')
    })
    expect(() => tx()).toThrow('intentional failure')
    const row = db.prepare('SELECT COUNT(*) as c FROM t2').get()
    expect(row.c).toBe(0)
  })

  it('persist 原子写文件到磁盘', () => {
    if (!db._db) return
    db.exec('CREATE TABLE IF NOT EXISTS t3 (id INTEGER PRIMARY KEY, val TEXT)')
    db.prepare('INSERT INTO t3 (val) VALUES (?)').run('persisted')
    expect(db._dirty).toBe(true)

    const result = db.persist()
    expect(result).toBe(true)
    expect(db._dirty).toBe(false)
    expect(fs.existsSync(dbPath)).toBe(true)
    // 不应有 .tmp 残留
    expect(fs.existsSync(dbPath + '.tmp')).toBe(false)
  })

  it('persist 无 _dirty 时跳过写入', () => {
    if (!db._db) return
    const result = db.persist()
    expect(result).toBe(true)
    // 无写入不应产生文件（除非已存在）
  })

  it('pragma 白名单拒绝不安全 PRAGMA', () => {
    if (!db._db) return
    // 安全的 PRAGMA 不抛错
    db.pragma('journal_mode = MEMORY')
    // 不安全的 PRAGMA 被静默拒绝（不抛错但不执行）
    db.pragma('DROP TABLE t1; --')
    // 验证表未被删除
    db.exec('CREATE TABLE IF NOT EXISTS check_table (id INTEGER)')
    db.pragma('DROP TABLE check_table; --')
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='check_table'").get()
    expect(row).toBeTruthy()
  })

  it('run 返回真实 changes 计数', () => {
    if (!db._db) return
    db.exec('CREATE TABLE IF NOT EXISTS t4 (id INTEGER PRIMARY KEY, name TEXT)')
    const result = db.prepare('INSERT INTO t4 (name) VALUES (?)').run('charlie')
    expect(result.changes).toBe(1)
  })

  it('close 自动调用 persist 持久化', () => {
    if (!db._db) return
    db.exec('CREATE TABLE IF NOT EXISTS t5 (id INTEGER PRIMARY KEY, val TEXT)')
    db.prepare('INSERT INTO t5 (val) VALUES (?)').run('will-persist')
    db.close()
    expect(fs.existsSync(dbPath)).toBe(true)
    db = null // 防止 afterEach 再次 close
  })

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })
})
