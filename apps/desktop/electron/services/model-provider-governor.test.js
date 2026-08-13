// @ts-check
/**
 * model-provider-governor.test.js — ModelProviderManager 运营限流预算 → ApiUsageGovernor 注入回归
 *
 * 验证：
 * - 初始化后把 provider config 的 rate_per_minute / limit_per_5h 注入 governor
 *   （setProviderLimits + setProviderTokenWindows requests 窗口）
 * - 未配置预算的 provider 不注入（保留静态表/默认）
 * - updateProvider 修改限流配置后重新应用；清空配置后移除/清除预算
 * - 布尔/0 等非法值归一化为 null（不注入）
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
})

afterAll(() => { if (database) database.close() })

function makeGovernorSpies () {
  return {
    setProviderLimits: vi.fn(),
    setProviderTokenWindows: vi.fn(),
    removeProviderLimits: vi.fn(),
  }
}

describe('ModelProviderManager 运营限流预算注入 governor', () => {
  it('初始化后按 provider config 注入 rpm/5h 预算（openai rpm=120→并发4）', () => {
    const spies = makeGovernorSpies()
    manager.setGovernor(spies)
    manager.init()

    const openaiLimits = spies.setProviderLimits.mock.calls.find(([id]) => id === 'openai')
    expect(openaiLimits).toBeDefined()
    expect(openaiLimits[1]).toMatchObject({ rpm: 120, maxConcurrent: 4 })

    // 5h 请求次数窗口：种子无 limit_per_5h（无代码事实）→ 注入清除（[]），不预置估算
    const openaiWindow = spies.setProviderTokenWindows.mock.calls.find(([id]) => id === 'openai')
    expect(openaiWindow).toBeDefined()
    expect(openaiWindow[1]).toEqual([])

    const videoLimits = spies.setProviderLimits.mock.calls.find(([id]) => id === 'minimax')
    // minimax 为 video 类别（rpm 6）：ceil(6/3)=2（2026-08-13 视频并发评估）
    expect(videoLimits[1].maxConcurrent).toBe(2)
  })

  it('updateProvider 修改 rate_per_minute 后预算被重新应用', () => {
    const spies = makeGovernorSpies()
    manager.setGovernor(spies)
    const updated = manager.updateProvider('openai', { config: { rate_per_minute: 30, limit_per_5h: 500 } })
    expect(updated.code).toBe(0)
    const openaiLimits = [...spies.setProviderLimits.mock.calls].reverse().find(([id]) => id === 'openai')
    expect(openaiLimits[1]).toMatchObject({ rpm: 30, maxConcurrent: 3 })
    const openaiWindow = [...spies.setProviderTokenWindows.mock.calls].reverse().find(([id]) => id === 'openai')
    expect(openaiWindow[1][0].limit).toBe(500)
  })

  it('清空限流配置后回填静态表预算并清除 5h 窗口（openai 静态 rpm=120/maxConcurrent=4）', () => {
    const spies = makeGovernorSpies()
    manager.setGovernor(spies)
    const updated = manager.updateProvider('openai', { config: { rate_per_minute: null, limit_per_5h: null } })
    expect(updated.code).toBe(0)
    const lastLimits = [...spies.setProviderLimits.mock.calls].reverse().find(([id]) => id === 'openai')
    // 静态表 PROVIDER_LIMITS.openai = { rpm: 120, maxConcurrent: 3 }
    expect(lastLimits[1]).toMatchObject({ rpm: 120, maxConcurrent: 3 })
    const cleared = [...spies.setProviderTokenWindows.mock.calls].reverse().some(([id, windows]) => id === 'openai' && windows.length === 0)
    expect(cleared).toBe(true)
  })

  it('布尔/0 等非法限流值归一化为 null（不注入 rpm 预算，窗口仅清空）', () => {
    const spies = makeGovernorSpies()
    manager.setGovernor(spies)
    const created = manager.createProvider({
      id: 'bool-limit-provider',
      name: 'Bool Limit',
      category: 'llm',
      base_url: 'https://api.example.com/v1',
      api_key: 'sk-test',
      models: ['m1'],
      config: { rate_per_minute: true, limit_per_5h: 0 },
    })
    expect(created.code).toBe(0)
    const calls = spies.setProviderLimits.mock.calls.filter(([id]) => id === 'bool-limit-provider')
    expect(calls.length).toBe(0)
    // 自定义 provider + 非法配置 → 移除预算（回退类别默认）
    expect(spies.removeProviderLimits.mock.calls.some(([id]) => id === 'bool-limit-provider')).toBe(true)
    // limit_per_5h=0 → null → 清除窗口（[]），不注入限流
    const windowCalls = spies.setProviderTokenWindows.mock.calls.filter(([id]) => id === 'bool-limit-provider')
    expect(windowCalls.length).toBe(1)
    expect(windowCalls[0][1]).toEqual([])
  })

  it('未配置限流的 provider 不注入 rpm 预算（不覆盖静态表）', () => {
    const spies = makeGovernorSpies()
    manager.setGovernor(spies)
    const created = manager.createProvider({
      id: 'no-limit-provider',
      name: 'No Limit',
      category: 'llm',
      base_url: 'https://api.example.com/v1',
      api_key: 'sk-test',
      models: ['m1'],
      config: {},
    })
    expect(created.code).toBe(0)
    const calls = spies.setProviderLimits.mock.calls.filter(([id]) => id === 'no-limit-provider')
    expect(calls.length).toBe(0)
    expect(spies.removeProviderLimits.mock.calls.some(([id]) => id === 'no-limit-provider')).toBe(true)
    const windowCalls = spies.setProviderTokenWindows.mock.calls.filter(([id]) => id === 'no-limit-provider')
    expect(windowCalls.length).toBe(1)
    expect(windowCalls[0][1]).toEqual([])
  })
})