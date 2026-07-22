/**
 * store 快照测试 — Phase 3 Task 9
 *
 * 目的：在按功能域物理拆分 store.js 之前，锁定所有公共方法的行为快照，
 *      确保拆分后 require('./store') 返回的接口完全一致。
 *
 * 覆盖维度：
 *   1. API 表面：所有 25 个公共方法 + 2 个私有辅助（_parseAccount/_safeJson）存在
 *   2. 未初始化降级：_ready=false 时每个方法返回安全默认值
 *   3. SQL 快照：mock db 拦截 SQL 语句，验证每个方法执行了正确的 SQL 模板
 *   4. 返回值快照：mock 预设返回值，验证方法的返回结构
 */

// ── Mock sqlite-wrapper：记录所有 SQL 调用 ─────────────
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
    return this._db._nextGet
  }
  MockStatement.prototype.all = function (...params) {
    this._db._allLog.push({ sql: this._sql, params })
    return this._db._nextAll || []
  }

  function MockDatabase () {
    this._runLog = []
    this._getLog = []
    this._allLog = []
    this._nextGet = undefined
    this._nextAll = []
    this._txFn = null
  }
  MockDatabase.prototype.prepare = function (sql) { return new MockStatement(this, sql) }
  MockDatabase.prototype.exec = function () {}
  MockDatabase.prototype.pragma = function () {}
  MockDatabase.prototype.persist = function () { return true }
  MockDatabase.prototype.close = function () {}
  MockDatabase.prototype.transaction = function (fn) {
    this._txFn = fn
    return function () { return fn.apply(this, arguments) }
  }
  return MockDatabase
}())

// ── Mock logger ────────────────────────────────────────
__registerMock('./logger', {
  info: function () {},
  warn: function () {},
  error: function () {},
  debug: function () {},
})

__enableElectronMock()

const Store = require('../electron/services/store')

// ── 期望的公共 API 表面（按功能域分组）─────────────────
const EXPECTED_API = {
  // 生命周期/基础设施（BaseStore）
  base: ['init', '_createTables', 'close', '_safeJson', 'migrateFromJsonl',
    'setOwnerSubjectProvider', '_resolveOwnerSubject'],
  // 账号
  account: ['addAccount', 'getAccount', 'listAccounts', 'deleteAccount',
    'updateAccount', 'setDefaultAccount', 'getDefaultAccount', '_parseAccount'],
  // 发布历史
  history: ['addPublishRecord', 'listPublishHistory', 'getPublishStats'],
  // 定时任务
  scheduler: ['addScheduledTask', 'listScheduledTasks', 'getPendingTasks',
    'updateTaskStatus', 'deleteTask'],
  // 设置
  settings: ['getSetting', 'setSetting', 'getUserSetting', 'setUserSetting'],
  // 回调日志
  callback: ['addCallbackLog', 'listCallbackLogs'],
  // 批量任务
  batch: ['addBatchJob', 'getBatchJob', 'listBatchJobs', 'updateBatchJob', 'deleteBatchJob'],
  // 发布频率
  rateLimit: ['getPublishTimeline', 'setPublishTimeline'],
  // 模型日志
  modelLog: ['addProviderLog', 'getProviderLogs', 'cleanProviderLogs'],
}

function getAllExpectedMethods () {
  const all = []
  for (const domain of Object.keys(EXPECTED_API)) {
    all.push(...EXPECTED_API[domain])
  }
  return all
}

// ── 辅助：创建已就绪的 store + mock db ─────────────────
function createReadyStore () {
  const store = new Store()
  const MockDatabase = require('../electron/services/sqlite-wrapper')
  store.db = new MockDatabase()
  store.db._runLog = []
  store.db._getLog = []
  store.db._allLog = []
  store._ready = true
  return store
}

describe('Store 快照 - API 表面', () => {
  it('所有 25 个公共方法 + 2 个私有辅助均存在', () => {
    const store = new Store()
    const expected = getAllExpectedMethods()
    // 25 公共 + 2 私有 + 2 生命周期 = 29 个，但 EXPECTED_API 已含全部
    for (const name of expected) {
      expect(typeof store[name]).toBe('function')
    }
  })

  it('Store 是一个 class（构造函数）', () => {
    expect(typeof Store).toBe('function')
    expect(Store.name).toBe('Store')
    // prototype 上有方法
    expect(Store.prototype.addAccount).toBeDefined()
  })

  it('每个功能域的方法都在 prototype 上', () => {
    for (const [domain, methods] of Object.entries(EXPECTED_API)) {
      for (const m of methods) {
        expect(Store.prototype[m]).toBeDefined()
        expect(typeof Store.prototype[m]).toBe('function')
      }
    }
  })
})

describe('Store 快照 - 未初始化时降级返回', () => {
  let store
  beforeEach(() => {
    store = new Store()
    store._ready = false
  })

  it('account 域：返回 false/null/[]', () => {
    expect(store.addAccount({})).toBe(false)
    expect(store.getAccount('x')).toBeNull()
    expect(store.listAccounts()).toEqual([])
    expect(store.deleteAccount('x')).toBe(false)
    expect(store.updateAccount('x', {})).toBe(false)
    expect(store.setDefaultAccount('p', 'a')).toBe(false)
    expect(store.getDefaultAccount('p')).toBeNull()
  })

  it('history 域：返回 null/{total:0,records:[]}/{total:0,...}', () => {
    expect(store.addPublishRecord({})).toBeNull()
    expect(store.listPublishHistory()).toEqual({ total: 0, records: [] })
    expect(store.getPublishStats()).toEqual({ total: 0, success: 0, failed: 0, byPlatform: {} })
  })

  it('scheduler 域：返回 null/[]/false', () => {
    expect(store.addScheduledTask({})).toBeNull()
    expect(store.listScheduledTasks()).toEqual([])
    expect(store.getPendingTasks()).toEqual([])
    expect(store.updateTaskStatus('x', 'done')).toBe(false)
    expect(store.deleteTask('x')).toBe(false)
  })

  it('settings 域：返回 defaultValue/undefined', () => {
    expect(store.getSetting('k', 'default')).toBe('default')
    expect(store.getSetting('k')).toBeNull()
    expect(store.setSetting('k', 'v')).toBeUndefined()
    expect(store.getUserSetting('k', 'default', 'user-a')).toBe('default')
    expect(store.setUserSetting('k', 'v', 'user-a')).toBeUndefined()
  })

  it('callback 域：返回 undefined/[]', () => {
    expect(store.addCallbackLog('t', 's', {})).toBeUndefined()
    expect(store.listCallbackLogs()).toEqual([])
  })

  it('batch 域：返回 false/null/[]', () => {
    expect(store.addBatchJob({})).toBe(false)
    expect(store.getBatchJob('x')).toBeNull()
    expect(store.listBatchJobs()).toEqual([])
    expect(store.updateBatchJob('x', {})).toBe(false)
    expect(store.deleteBatchJob('x')).toBe(false)
  })

  it('rateLimit 域：返回 null/undefined', () => {
    expect(store.getPublishTimeline('k')).toBeNull()
    expect(store.setPublishTimeline('k', 1)).toBeUndefined()
  })

  it('modelLog 域：返回 false/[]/0', () => {
    expect(store.addProviderLog({})).toBe(false)
    expect(store.getProviderLogs()).toEqual([])
    expect(store.cleanProviderLogs()).toBe(0)
  })
})

describe('Store 快照 - SQL 执行模板', () => {
  let store

  beforeEach(() => {
    store = createReadyStore()
  })

  it('addAccount 执行 INSERT OR REPLACE INTO accounts', () => {
    store.addAccount({ id: 1, platform: 'douyin', name: 'u' }, 'user-a')
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO accounts'))
    expect(call).toBeTruthy()
    expect(call.params[0]).toBe('user-a')
    expect(call.params[1]).toBe('1')
    expect(call.params[2]).toBe('douyin')
  })

  it('getAccount 同时按 owner_subject 和 id 查询', () => {
    store.db._nextGet = { id: 5, platform: 'wx', cookies: '[]', localStorage: '{}' }
    store.getAccount(5, 'user-a')
    const call = store.db._getLog.find(r => r.sql.includes('WHERE owner_subject = ? AND id = ?'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['user-a', '5'])
  })

  it('listAccounts 无平台过滤执行 ORDER BY platform', () => {
    store.db._nextAll = []
    store.listAccounts()
    const call = store.db._allLog.find(r => r.sql.includes('ORDER BY platform, created_at DESC'))
    expect(call).toBeTruthy()
  })

  it('listAccounts 带平台过滤执行 WHERE platform = ?', () => {
    store.db._nextAll = []
    store.listAccounts('douyin', 'user-a')
    const call = store.db._allLog.find(r => r.sql.includes('owner_subject = ? AND platform = ?'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['user-a', 'douyin'])
  })

  it('deleteAccount 仅级联清理当前 owner 的账号、任务和历史', () => {
    store.db._nextGet = { platform: 'wx' }
    store.db._nextAll = [{
      id: 'related-1',
      article: JSON.stringify({ accountId: 'acc1' }),
      result: JSON.stringify({ accountId: 'acc1' }),
    }]
    store.deleteAccount('acc1', 'user-a')
    const deleteCalls = store.db._runLog.filter(r => r.sql.includes('DELETE FROM'))
    const tables = deleteCalls.map(c => c.sql.match(/DELETE FROM (\w+)/)[1])
    expect(tables).toEqual(['accounts', 'scheduled_tasks', 'publish_history'])
    expect(deleteCalls.every(call => call.params[0] === 'user-a')).toBe(true)
  })

  it('updateAccount 通过白名单过滤字段', () => {
    store.updateAccount('acc1', { name: 'new', evil: 'hacker' })
    const call = store.db._runLog.find(r => r.sql.includes('UPDATE accounts SET'))
    expect(call).toBeTruthy()
    // evil 字段不应出现
    expect(call.sql.includes('evil')).toBe(false)
  })

  it('setDefaultAccount 在事务中执行 2 条 UPDATE', () => {
    store.db._nextGet = { id: 'acc1' }
    store.setDefaultAccount('wx', 'acc1', 'user-a')
    const updates = store.db._runLog.filter(r => r.sql.includes('UPDATE accounts SET is_default'))
    expect(updates.length).toBe(2)
    expect(updates.every(call => call.params[0] === 'user-a')).toBe(true)
  })

  it('addPublishRecord 执行 INSERT OR REPLACE INTO publish_history', () => {
    const id = store.addPublishRecord({ platform: 'wx', title: 't' })
    expect(id).toBeTruthy()
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO publish_history'))
    expect(call).toBeTruthy()
  })

  it('listPublishHistory 执行 COUNT + SELECT', () => {
    store.db._nextGet = { total: 0 }
    store.db._nextAll = []
    store.listPublishHistory({ platform: 'wx', limit: 10, offset: 5 }, 'user-a')
    const countCall = store.db._getLog.find(r => r.sql.includes('COUNT(*)'))
    expect(countCall).toBeTruthy()
    expect(countCall.params).toEqual(['user-a', 'wx'])
    const selectCall = store.db._allLog.find(r => r.sql.includes('LIMIT') && r.sql.includes('OFFSET'))
    expect(selectCall).toBeTruthy()
  })

  it('getPublishStats 执行 SELECT platform, status FROM publish_history', () => {
    store.db._nextAll = [{ platform: 'wx', status: 'success' }, { platform: 'wx', status: 'failed' }]
    const stats = store.getPublishStats('user-a')
    expect(stats.total).toBe(2)
    expect(stats.success).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.byPlatform.wx.total).toBe(2)
  })

  it('addScheduledTask 执行 INSERT OR REPLACE INTO scheduled_tasks', () => {
    const id = store.addScheduledTask({ platform: 'wx', article: { x: 1 }, publish_time: '2025' })
    expect(id).toBeTruthy()
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO scheduled_tasks'))
    expect(call).toBeTruthy()
  })

  it('getPendingTasks 执行 status=pending AND publish_time <= now', () => {
    store.db._nextAll = []
    store.getPendingTasks('user-a')
    const call = store.db._allLog.find(r => r.sql.includes("status = 'pending'") && r.sql.includes('publish_time <='))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['user-a'])
  })

  it('getSetting 执行 SELECT value FROM settings WHERE key = ?', () => {
    store.db._nextGet = { value: '"dark"' }
    const v = store.getSetting('theme', 'default')
    expect(v).toBe('dark')
    const call = store.db._getLog.find(r => r.sql.includes('SELECT value FROM settings WHERE key = ?'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['theme'])
  })

  it('setSetting 执行 INSERT OR REPLACE INTO settings', () => {
    store.setSetting('theme', 'dark')
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO settings'))
    expect(call).toBeTruthy()
  })

  it('addCallbackLog 执行 INSERT INTO callback_logs', () => {
    store.addCallbackLog('comment', 'wx', { foo: 1 })
    const call = store.db._runLog.find(r => r.sql.includes('INSERT INTO callback_logs'))
    expect(call).toBeTruthy()
    expect(call.params[0]).toBe('comment')
    expect(call.params[1]).toBe('wx')
  })

  it('listCallbackLogs 执行 ORDER BY created_at DESC LIMIT ?', () => {
    store.db._nextAll = []
    store.listCallbackLogs(20)
    const call = store.db._allLog.find(r => r.sql.includes('ORDER BY created_at DESC LIMIT ?'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual([20])
  })

  it('addBatchJob 执行 INSERT OR REPLACE INTO batch_jobs', () => {
    store.addBatchJob({ id: 'b1', name: 'n', articles: [], total: 0 })
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO batch_jobs'))
    expect(call).toBeTruthy()
  })

  it('updateBatchJob 通过白名单过滤字段', () => {
    store.updateBatchJob('b1', { name: 'n', evil: 'x' })
    const call = store.db._runLog.find(r => r.sql.includes('UPDATE batch_jobs SET'))
    expect(call).toBeTruthy()
    expect(call.sql.includes('evil')).toBe(false)
  })

  it('getPublishTimeline 执行 SELECT last_publish_at', () => {
    store.db._nextGet = { last_publish_at: '12345' }
    const v = store.getPublishTimeline('wx:acc1')
    expect(v).toBe('12345')
    const call = store.db._getLog.find(r => r.sql.includes('SELECT last_publish_at'))
    expect(call).toBeTruthy()
  })

  it('setPublishTimeline 执行 INSERT OR REPLACE INTO publish_timeline', () => {
    store.setPublishTimeline('wx:acc1', 12345)
    const call = store.db._runLog.find(r => r.sql.includes('INSERT OR REPLACE INTO publish_timeline'))
    expect(call).toBeTruthy()
  })

  it('addProviderLog 缺必填字段返回 false', () => {
    const r = store.addProviderLog({ provider_id: 'p1' })
    expect(r).toBe(false)
  })

  it('addProviderLog 完整字段执行 INSERT INTO model_provider_logs', () => {
    const r = store.addProviderLog({
      provider_id: 'p1', category: 'llm', action: 'chat', status: 'success'
    })
    expect(r).toBe(true)
    const call = store.db._runLog.find(r => r.sql.includes('INSERT INTO model_provider_logs'))
    expect(call).toBeTruthy()
  })

  it('getProviderLogs 支持过滤条件', () => {
    store.db._nextAll = []
    store.getProviderLogs({ provider_id: 'p1', category: 'llm', status: 'success', limit: 50 })
    const call = store.db._allLog.find(r => r.sql.includes('provider_id = ?') && r.sql.includes('category = ?') && r.sql.includes('status = ?'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['p1', 'llm', 'success', 50])
  })

  it('cleanProviderLogs 执行 DELETE WHERE created_at < datetime', () => {
    store.db._runLog = []
    store.cleanProviderLogs(7)
    const call = store.db._runLog.find(r => r.sql.includes('DELETE FROM model_provider_logs') && r.sql.includes('created_at <'))
    expect(call).toBeTruthy()
    expect(call.params).toEqual(['-7 days'])
  })
})

describe('Store 快照 - close 生命周期', () => {
  it('close 清理 persistTimer 和 db', () => {
    const store = new Store()
    store._persistTimer = { fake: true }
    store.db = { close: function () {} }
    store._ready = true
    store.close()
    expect(store._persistTimer).toBeNull()
    expect(store.db).toBeNull()
    expect(store._ready).toBe(false)
  })

  it('init 重复调用幂等（_ready=true 时直接返回）', () => {
    const store = new Store()
    store._ready = true
    expect(store.init()).toBe(true)
  })
})

describe('Store 快照 - _safeJson 行为', () => {
  it('合法 JSON 字符串解析为对象', () => {
    const store = new Store()
    expect(store._safeJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('非法 JSON 返回原字符串', () => {
    const store = new Store()
    expect(store._safeJson('not-json')).toBe('not-json')
  })
})

describe('Store 快照 - owner subject 解析', () => {
  it('未配置身份服务时只使用 legacy 命名空间', () => {
    const store = new Store()
    expect(store._resolveOwnerSubject()).toBe('__legacy__')
  })

  it('身份解析器缺少 sub 时 fail-closed', () => {
    const store = new Store()
    store.setOwnerSubjectProvider(() => '')
    expect(store._resolveOwnerSubject()).toBeNull()
  })

  it('显式 owner 优先于当前登录用户', () => {
    const store = new Store()
    store.setOwnerSubjectProvider(() => 'current-user')
    expect(store._resolveOwnerSubject('task-owner')).toBe('task-owner')
  })
})
