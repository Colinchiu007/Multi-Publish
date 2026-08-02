// @ts-check
/**
 * model-provider-minimax-fixed-model.test.js — MiniMax Image 预设与 setDefault 提示回归
 *
 * 回归：
 * - 预设 minimax-image 固定使用 image-01，不要求用户填写 Model ID。
 * - 旧种子行（image-01 + image-01-live）在 init 时同步为 image-01；
 *   用户自定义模型列表不得被覆盖。
 * - setDefault 未配置 API Key 时返回中文友好提示，而不是英文内部文案。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import initSqlJs from 'sql.js'

__enableElectronMock()
__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
__registerMock('./crypto', {
  isAvailable: () => true,
  encrypt: key => key ? Buffer.from('enc_' + key) : null,
  decrypt: value => value ? Buffer.from(value).toString('utf8').replace(/^enc_/, '') : '',
  mask: key => key ? key.slice(0, 4) + '****' + key.slice(-4) : '****',
  setSafeStorage: () => {},
})

class SqlJsAdapter {
  constructor (database) { this.database = database }
  prepare (sql) {
    const database = this.database
    return {
      run (...params) {
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        statement.step()
        const changes = database.getRowsModified()
        statement.free()
        return { changes }
      },
      get (...params) {
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        const row = statement.step() ? statement.getAsObject() : undefined
        statement.free()
        return row
      },
      all (...params) {
        const rows = []
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        while (statement.step()) rows.push(statement.getAsObject())
        statement.free()
        return rows
      },
    }
  }
  exec (sql) { this.database.exec(sql) }
  transaction (fn) {
    return () => {
      this.database.exec('BEGIN')
      try {
        const result = fn()
        this.database.exec('COMMIT')
        return result
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
    }
  }
}

async function createStore (database) {
  const { SCHEMA_SQL } = require('./store-schema')
  const db = new SqlJsAdapter(database)
  for (const statement of SCHEMA_SQL) db.exec(statement)
  const store = { db, _ready: true, getSetting: () => null, setSetting: () => {} }
  return { db, store }
}

function newManager (store) {
  const { ModelProviderManager } = require('./model-provider-manager')
  const manager = new ModelProviderManager(store)
  manager.init()
  return manager
}

describe('MiniMax Image 预设固定模型', () => {
  let database

  beforeAll(async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
  })

  afterAll(() => { if (database) database.close() })

  it('预设 minimax-image 的模型固定为 image-01（单模型服务商，无需填 Model ID）', async () => {
    const { store } = await createStore(database)
    const manager = newManager(store)
    const presets = manager.getAvailablePresets('image')
    const minimax = presets.find(preset => preset.id === 'minimax-image')
    expect(minimax).toBeDefined()
    expect(minimax.models).toEqual(['image-01'])
  })

  it('init 把旧默认种子行同步为 image-01，但保留用户自定义模型', async () => {
    const SQL = await initSqlJs()
    const dbA = new SQL.Database()
    const dbB = new SQL.Database()
    try {
      const { db, store } = await createStore(dbA)
      db.prepare(
        `INSERT INTO model_providers (id, name, category, base_url, api_key, api_key_enc, models, enabled, is_default, is_preset, config, created_at, updated_at)
         VALUES ('minimax-image', 'MiniMax Image', 'image', 'https://api.minimaxi.com/v1', '', NULL, ?, 1, 0, 1, '{}', datetime('now'), datetime('now'))`
      ).run(JSON.stringify(['image-01', 'image-01-live']))
      newManager(store)
      const migrated = db.prepare("SELECT models FROM model_providers WHERE id = 'minimax-image'").get().models
      expect(JSON.parse(migrated)).toEqual(['image-01'])

      const { db: db2, store: store2 } = await createStore(dbB)
      db2.prepare(
        `INSERT INTO model_providers (id, name, category, base_url, api_key, api_key_enc, models, enabled, is_default, is_preset, config, created_at, updated_at)
         VALUES ('minimax-image', 'MiniMax Image', 'image', 'https://api.minimaxi.com/v1', '', NULL, ?, 1, 0, 1, '{}', datetime('now'), datetime('now'))`
      ).run(JSON.stringify(['my-custom-model']))
      newManager(store2)
      const kept = db2.prepare("SELECT models FROM model_providers WHERE id = 'minimax-image'").get().models
      expect(JSON.parse(kept)).toEqual(['my-custom-model'])
    } finally {
      dbA.close()
      dbB.close()
    }
  })
})

describe('setDefault API Key 提示', () => {
  let database

  beforeAll(async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
  })

  afterAll(() => { if (database) database.close() })

  it('未配置 API Key 时返回中文友好提示', async () => {
    const { store } = await createStore(database)
    const manager = newManager(store)
    const result = manager.setDefault('image', 'minimax-image')
    expect(result.code).toBe(-1)
    expect(result.message).toContain('请先')
    expect(result.message).toContain('API Key')
    expect(result.message).not.toContain('Please configure API Key')
  })

  it('配置 API Key 后可设为默认', async () => {
    const { db, store } = await createStore(database)
    const manager = newManager(store)
    const update = manager.updateProvider('minimax-image', { api_key: 'mm-image-test-key', enabled: true })
    expect(update.code).toBe(0)
    const result = manager.setDefault('image', 'minimax-image')
    expect(result.code).toBe(0)
    const row = db.prepare('SELECT is_default FROM model_providers WHERE id = ?').get('minimax-image')
    expect(Number(row.is_default)).toBe(1)
  })
})
