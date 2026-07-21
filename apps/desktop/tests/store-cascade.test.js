/**
 * store 级联清理测试 — R33 强制补测试（跨5轮债务）
 * 覆盖：deleteAccount 仅在当前 owner 内级联清理关联表。
 *
 * 使用 __registerMock 拦截 require，避免依赖真实 sql.js 初始化。
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。
 */

// Mock sqlite-wrapper：提供带 _runLog/_getLog 的 MockDatabase
__registerMock('./sqlite-wrapper', function () {
  function MockStatement (db, sql) {
    this._db = db
    this._sql = sql
  }
  MockStatement.prototype.run = function (...params) {
    this._db._runLog.push({ sql: this._sql, params })
    return { changes: 1 }
  }
  MockStatement.prototype.get = function (...params) {
    this._db._getLog.push({ sql: this._sql, params })
    // deleteAccount 先查 platform
    if (this._sql.indexOf('SELECT platform FROM accounts') >= 0) {
      return { platform: 'douyin' }
    }
    return undefined
  }
  MockStatement.prototype.all = function () { return [] }

  function MockDatabase () {
    this._runLog = []
    this._getLog = []
    this._transactionCalls = 0
    this._dirty = false
  }
  MockDatabase.prototype.prepare = function (sql) { return new MockStatement(this, sql) }
  MockDatabase.prototype.exec = function () {}
  MockDatabase.prototype.pragma = function () {}
  MockDatabase.prototype.transaction = function (fn) {
    const db = this
    return function () {
      db._transactionCalls += 1
      return fn()
    }
  }
  MockDatabase.prototype.persist = function () { return true }
  MockDatabase.prototype.close = function () {}

  return MockDatabase
}())

// Mock logger
__registerMock('./logger', {
  info: function () {},
  warn: function () {},
  error: function () {},
  debug: function () {},
})

// Mock electron app.getPath
__enableElectronMock()

const Store = require('../electron/services/store')

describe('store deleteAccount 级联清理', () => {
  let store
  let MockDatabase

  beforeEach(() => {
    store = new Store()
    // 手动初始化 mock db
    MockDatabase = require('../electron/services/sqlite-wrapper')
    store.db = new MockDatabase()
    store.db._runLog = []
    store.db._getLog = []
    store._ready = true
    store.setOwnerSubjectProvider(() => 'user-a')
  })

  it('deleteAccount 清理 accounts 表', () => {
    store.deleteAccount('acc_001')
    const deleteAccountCall = store.db._runLog.find(
      r => r.sql.indexOf('DELETE FROM accounts') >= 0
    )
    expect(deleteAccountCall).toBeTruthy()
    expect(deleteAccountCall.params).toEqual(['user-a', 'acc_001'])
  })

  it('deleteAccount 级联清理 scheduled_tasks', () => {
    store.deleteAccount('acc_002')
    const call = store.db._runLog.find(
      r => r.sql.indexOf('DELETE FROM scheduled_tasks') >= 0
    )
    expect(call).toBeTruthy()
    expect(call.params[0]).toBe('user-a')
    expect(call.params[1]).toBe('douyin')
    expect(call.params[2]).toContain('acc_002')
  })

  it('deleteAccount 级联清理 publish_history', () => {
    store.deleteAccount('acc_003')
    const call = store.db._runLog.find(
      r => r.sql.indexOf('DELETE FROM publish_history') >= 0
    )
    expect(call).toBeTruthy()
    expect(call.params[0]).toBe('user-a')
    expect(call.params[1]).toBe('douyin')
    expect(call.params[2]).toContain('acc_003')
  })

  it('deleteAccount 不删除独立的用户设置', () => {
    store.deleteAccount('acc_004')
    const call = store.db._runLog.find(
      r => r.sql.indexOf('DELETE FROM settings') >= 0
    )
    expect(call).toBeUndefined()
  })

  it('deleteAccount 调用 persist 持久化', () => {
    let persistCalled = false
    const origPersist = store.db.persist
    store.db.persist = function () { persistCalled = true; return true }
    store.deleteAccount('acc_005')
    expect(persistCalled).toBe(true)
    store.db.persist = origPersist
  })

  it('deleteAccount 未初始化时返回 false', () => {
    store._ready = false
    const result = store.deleteAccount('acc_006')
    expect(result).toBe(false)
  })

  it('deleteAccount 返回 true 表示成功', () => {
    const result = store.deleteAccount('acc_007')
    expect(result).toBe(true)
  })

  it('deleteAccount 在单一事务内执行全部级联删除', () => {
    store.deleteAccount('acc_tx')
    expect(store.db._transactionCalls).toBe(1)
  })

  it('deleteAccount 账号不存在时 fail-closed，不清理其他数据', () => {
    // mock get 返回 undefined（账号不存在）
    store.db.prepare = function (sql) {
      return {
        run: function (...p) { store.db._runLog.push({ sql, params: p }); return { changes: 0 } },
        get: function () { return undefined }, // 账号不存在
        all: function () { return [] },
      }
    }
    expect(store.deleteAccount('nonexistent')).toBe(false)
    const calls = store.db._runLog.filter(r => r.sql.indexOf('DELETE') >= 0)
    expect(calls).toHaveLength(0)
    expect(store.db._transactionCalls).toBe(0)
  })
})
