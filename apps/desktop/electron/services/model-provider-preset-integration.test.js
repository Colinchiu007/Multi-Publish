// @ts-check
/**
 * Real SQLite-shaped DB + real model-provider IPC regression coverage.
 * Seed rows must remain selectable because they represent the built-in catalog,
 * not a completed user configuration.
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

let ipcMain
let database
let manager

beforeAll(async () => {
  const SQL = await initSqlJs()
  database = new SQL.Database()
  const { SCHEMA_SQL } = require('./store-schema')
  const db = new SqlJsAdapter(database)
  for (const statement of SCHEMA_SQL) db.exec(statement)

  const store = { db, _ready: true, getSetting: () => null, setSetting: () => {} }
  manager = new (require('./model-provider-manager').ModelProviderManager)(store)
  manager.init()

  const registerHandlers = require('../ipc-handlers/model-provider')
  const handlers = {}
  ipcMain = {
    handle: vi.fn((channel, handler) => { handlers[channel] = handler }),
    call: (channel, ...args) => handlers[channel]({ sender: {}, senderFrame: undefined }, ...args),
  }
  registerHandlers(ipcMain, { modelProviderManager: manager, store, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
})

afterAll(() => { if (database) database.close() })

describe('model-provider preset catalog integration', function () {
  it('returns image presets after seed initialization', async function () {
    const result = await ipcMain.call('model-provider:presets', 'image')
    expect(result.code).toBe(0)
    expect(result.data.map(preset => preset.id)).toEqual(expect.arrayContaining(['flux', 'dall-e']))
    expect(result.data.every(preset => preset.category === 'image')).toBe(true)
  })

  it('keeps seeded rows selectable and updates the row instead of duplicating it', async function () {
    const before = database.prepare('SELECT COUNT(*) AS count FROM model_providers WHERE id = ?')
    before.bind(['flux'])
    before.step()
    const countBefore = before.getAsObject().count
    before.free()

    const create = await ipcMain.call('model-provider:create', {
      id: 'flux', name: 'Flux', category: 'image', base_url: 'https://api.bfl.ml/v1',
      api_key: 'sk-flux-test-key', models: ['flux-pro'],
    })
    expect(create.code).toBe(-1)
    expect(create.message).toContain('already exists')

    const update = await ipcMain.call('model-provider:update', 'flux', { api_key: 'sk-flux-test-key', enabled: true })
    expect(update.code).toBe(0)

    const after = database.prepare('SELECT COUNT(*) AS count, enabled FROM model_providers WHERE id = ?')
    after.bind(['flux'])
    after.step()
    const row = after.getAsObject()
    after.free()
    expect(row.count).toBe(countBefore)
    expect(row.enabled).toBe(1)
  })

  it('保存 MiniMax Image API Key 后 testConnection 不再报 API Key not configured', async function () {
    const update = await ipcMain.call('model-provider:update', 'minimax-image', { api_key: 'mm-image-test-key', enabled: true })
    expect(update.code).toBe(0)

    const test = await ipcMain.call('model-provider:test', 'minimax-image')
    expect(test.code).toBe(0)
    expect(test.data && test.data.success).toBe(true)
  })

  it('更新服务商但 API Key 留空时保留已保存的 Key（不误清除）', async function () {
    await ipcMain.call('model-provider:update', 'minimax-image', { api_key: 'mm-image-test-key', enabled: true })
    const keep = await ipcMain.call('model-provider:update', 'minimax-image', { api_key: '', name: 'MiniMax Image 2' })
    expect(keep.code).toBe(0)

    const test = await ipcMain.call('model-provider:test', 'minimax-image')
    expect(test.code).toBe(0)
  })
})
