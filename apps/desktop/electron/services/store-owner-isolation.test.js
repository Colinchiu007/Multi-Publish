import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'

__enableElectronMock()

let SQL
let Store
let schema
let rawDb
let store

class SqlJsAdapter {
  constructor (db) {
    this._db = db
    this._runFailureSqlFragment = null
  }

  exec (sql) {
    this._db.exec(sql)
  }

  execOrThrow (sql) {
    this._db.exec(sql)
  }

  prepare (sql) {
    const db = this._db
    const runFailureSqlFragment = this._runFailureSqlFragment
    return {
      run (...params) {
        if (runFailureSqlFragment && sql.includes(runFailureSqlFragment)) {
          return { changes: 0, error: '测试注入的数据库写入失败' }
        }
        db.run(sql, params)
        return { changes: db.getRowsModified() }
      },
      get (...params) {
        const stmt = db.prepare(sql)
        try {
          stmt.bind(params)
          return stmt.step() ? stmt.getAsObject() : undefined
        } finally {
          stmt.free()
        }
      },
      all (...params) {
        const stmt = db.prepare(sql)
        const rows = []
        try {
          stmt.bind(params)
          while (stmt.step()) rows.push(stmt.getAsObject())
          return rows
        } finally {
          stmt.free()
        }
      },
    }
  }

  transaction (fn) {
    return () => {
      this._db.exec('BEGIN')
      try {
        const result = fn()
        this._db.exec('COMMIT')
        return result
      } catch (error) {
        this._db.exec('ROLLBACK')
        throw error
      }
    }
  }

  persist () {
    return true
  }
}

function executeSchema () {
  for (const sql of schema.SCHEMA_SQL) rawDb.exec(sql)
}

function tableInfo (table) {
  const result = rawDb.exec(`PRAGMA table_info(${table})`)
  if (result.length === 0) return []
  return result[0].values.map((values) => Object.fromEntries(
    result[0].columns.map((column, index) => [column, values[index]]),
  ))
}

function queryRows (sql, params = []) {
  const stmt = rawDb.prepare(sql)
  const rows = []
  try {
    stmt.bind(params)
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

beforeAll(async () => {
  SQL = await initSqlJs()
  Store = require('./store')
  schema = require('./store-schema')
})

beforeEach(() => {
  rawDb = new SQL.Database()
  executeSchema()
  store = new Store()
  store.db = new SqlJsAdapter(rawDb)
  store._ready = true
})

afterEach(() => {
  if (rawDb) rawDb.close()
})

describe('Store 多用户隔离', () => {
  it('新库为三张用户数据表创建 owner_subject 复合主键', () => {
    for (const table of ['accounts', 'publish_history', 'scheduled_tasks']) {
      const info = tableInfo(table)
      const primaryKey = info
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name)

      expect(info.map((column) => column.name)).toContain('owner_subject')
      expect(primaryKey).toEqual(['owner_subject', 'id'])
    }

    const historyColumns = tableInfo('publish_history').map((column) => column.name)
    expect(historyColumns).toEqual(expect.arrayContaining(['task_id', 'error']))
  })

  it('旧库迁移为租户表并把无归属数据标记为 legacy', () => {
    rawDb.close()
    rawDb = new SQL.Database()
    rawDb.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, platform TEXT NOT NULL, account_name TEXT);
      CREATE TABLE publish_history (id INTEGER PRIMARY KEY, platform TEXT NOT NULL, status TEXT);
      CREATE TABLE scheduled_tasks (id TEXT PRIMARY KEY, platform TEXT NOT NULL, status TEXT);
      INSERT INTO accounts VALUES (1, 'douyin', 'old-account');
      INSERT INTO publish_history VALUES (2, 'douyin', 'success');
      INSERT INTO scheduled_tasks VALUES ('task-1', 'douyin', 'pending');
    `)
    const adapter = new SqlJsAdapter(rawDb)

    schema.migrateOwnerIsolationSchema(adapter)
    schema.migrateOwnerIsolationSchema(adapter)

    for (const table of ['accounts', 'publish_history', 'scheduled_tasks']) {
      const rows = queryRows(`SELECT owner_subject FROM ${table}`)
      expect(rows).toEqual([{ owner_subject: schema.LEGACY_OWNER_SUBJECT }])
    }
  })

  it('相同账号 ID 可以分别属于两个用户且不会互相覆盖', () => {
    store.addAccount({ id: 'shared-account', platform: 'douyin', name: '用户 A' }, 'user-a')
    store.addAccount({ id: 'shared-account', platform: 'douyin', name: '用户 B' }, 'user-b')

    expect(store.getAccount('shared-account', 'user-a').name).toBe('用户 A')
    expect(store.getAccount('shared-account', 'user-b').name).toBe('用户 B')
    expect(store.listAccounts('douyin', 'user-a')).toHaveLength(1)
    expect(store.listAccounts('douyin', 'user-b')).toHaveLength(1)
  })

  it('发布历史列表和统计只包含当前用户的数据', () => {
    store.addPublishRecord({ id: 'record-a', platform: 'douyin', status: 'success' }, 'user-a')
    store.addPublishRecord({ id: 'record-b', platform: 'douyin', status: 'failed' }, 'user-b')

    expect(store.listPublishHistory({}, 'user-a')).toMatchObject({
      total: 1,
      records: [{ id: 'record-a', owner_subject: 'user-a' }],
    })
    expect(store.getPublishStats('user-a')).toMatchObject({ total: 1, success: 1, failed: 0 })
    expect(store.getPublishStats('user-b')).toMatchObject({ total: 1, success: 0, failed: 1 })
  })

  it('定时任务的查询、更新和删除必须同时匹配 owner_subject', () => {
    store.addScheduledTask({ id: 'shared-task', platform: 'douyin', status: 'pending' }, 'user-a')
    store.addScheduledTask({ id: 'shared-task', platform: 'douyin', status: 'pending' }, 'user-b')

    store.updateTaskStatus('shared-task', 'success', 'user-a')
    expect(store.listScheduledTasks('user-a')[0].status).toBe('success')
    expect(store.listScheduledTasks('user-b')[0].status).toBe('pending')

    store.deleteTask('shared-task', 'user-a')
    expect(store.listScheduledTasks('user-a')).toEqual([])
    expect(store.listScheduledTasks('user-b')).toHaveLength(1)
  })

  it('删除账号只级联清理同一 owner 的任务和历史', () => {
    for (const owner of ['user-a', 'user-b']) {
      store.addAccount({ id: 'shared-account', platform: 'douyin' }, owner)
      store.addScheduledTask({
        id: `task-${owner}`,
        platform: 'douyin',
        article: { accountId: 'shared-account' },
      }, owner)
      store.addPublishRecord({
        id: `record-${owner}`,
        platform: 'douyin',
        result: { accountId: 'shared-account' },
      }, owner)
    }

    store.deleteAccount('shared-account', 'user-a')

    expect(store.getAccount('shared-account', 'user-a')).toBeNull()
    expect(store.getAccount('shared-account', 'user-b')).not.toBeNull()
    expect(store.listScheduledTasks('user-a')).toEqual([])
    expect(store.listScheduledTasks('user-b')).toHaveLength(1)
    expect(store.listPublishHistory({}, 'user-a').records).toEqual([])
    expect(store.listPublishHistory({}, 'user-b').records).toHaveLength(1)
  })

  it('账号 ID 含 LIKE 通配符时只删除精确关联的任务和历史', () => {
    const targetId = 'account_%_target'
    const siblingId = 'account_any_target'
    for (const accountId of [targetId, siblingId]) {
      store.addAccount({ id: accountId, platform: 'douyin' }, 'user-a')
      store.addScheduledTask({
        id: `task-${accountId}`,
        platform: 'douyin',
        article: { accountId },
      }, 'user-a')
      store.addPublishRecord({
        id: `record-${accountId}`,
        platform: 'douyin',
        result: { accountId },
      }, 'user-a')
    }

    store.deleteAccount(targetId, 'user-a')

    expect(store.listScheduledTasks('user-a').map(task => task.id)).toEqual([`task-${siblingId}`])
    expect(store.listPublishHistory({}, 'user-a').records.map(record => record.id))
      .toEqual([`record-${siblingId}`])
  })

  it('级联删除任一写入失败时回滚全部账号数据并返回 false', () => {
    store.addAccount({ id: 'rollback-account', platform: 'douyin' }, 'user-a')
    store.addScheduledTask({
      id: 'rollback-task',
      platform: 'douyin',
      article: { accountId: 'rollback-account' },
    }, 'user-a')
    store.addPublishRecord({
      id: 'rollback-record',
      platform: 'douyin',
      result: { accountId: 'rollback-account' },
    }, 'user-a')
    store.db._runFailureSqlFragment = 'DELETE FROM scheduled_tasks'

    expect(store.deleteAccount('rollback-account', 'user-a')).toBe(false)
    expect(store.getAccount('rollback-account', 'user-a')).not.toBeNull()
    expect(store.listScheduledTasks('user-a').map(task => task.id)).toContain('rollback-task')
    expect(store.listPublishHistory({}, 'user-a').records.map(record => record.id))
      .toContain('rollback-record')
  })

  it('批量任务按 owner 隔离，允许不同用户使用相同 batch id', () => {
    store.addBatchJob({ id: 'shared-batch', name: 'A', articles: [{ title: 'A' }], total: 1 }, 'user-a')
    store.addBatchJob({ id: 'shared-batch', name: 'B', articles: [{ title: 'B' }], total: 1 }, 'user-b')

    expect(store.getBatchJob('shared-batch', 'user-a').name).toBe('A')
    expect(store.getBatchJob('shared-batch', 'user-b').name).toBe('B')
    expect(store.listBatchJobs('user-a').map(job => job.name)).toEqual(['A'])

    store.deleteBatchJob('shared-batch', 'user-a')
    expect(store.getBatchJob('shared-batch', 'user-a')).toBeNull()
    expect(store.getBatchJob('shared-batch', 'user-b')).not.toBeNull()
  })

  it('批量任务更新和删除跨 owner 或不存在记录时返回 false', () => {
    store.addBatchJob({ id: 'batch-a', name: 'A', articles: [], total: 0 }, 'user-a')

    expect(store.updateBatchJob('batch-a', { name: 'B' }, 'user-b')).toBe(false)
    expect(store.deleteBatchJob('batch-a', 'user-b')).toBe(false)
    expect(store.getBatchJob('batch-a', 'user-a').name).toBe('A')
  })

  it('草稿设置和发布频率时间线按 owner 隔离', () => {
    store.setUserSetting('drafts', [{ id: 'draft-a', title: 'A' }], 'user-a')
    store.setUserSetting('drafts', [{ id: 'draft-b', title: 'B' }], 'user-b')
    store.setPublishTimeline('douyin:shared-account', 100, 'user-a')
    store.setPublishTimeline('douyin:shared-account', 200, 'user-b')

    expect(store.getUserSetting('drafts', [], 'user-a')).toEqual([{ id: 'draft-a', title: 'A' }])
    expect(store.getUserSetting('drafts', [], 'user-b')).toEqual([{ id: 'draft-b', title: 'B' }])
    expect(store.getPublishTimeline('douyin:shared-account', 'user-a')).toBe('100')
    expect(store.getPublishTimeline('douyin:shared-account', 'user-b')).toBe('200')
  })
})
