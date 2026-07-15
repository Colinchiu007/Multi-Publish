// @ts-check
/**
 * model-provider-call-adapter.test.js — P3.2 TDD: manager.callAdapter 集成测试
 *
 * 验证：
 * - callAdapter 从 registry 获取 Adapter
 * - 凭据注入（从 db 读取 api_key_enc 解密后传入 Adapter）
 * - 方法调用（chatCompletion/listModels/testConnection）
 * - 能力检查（不支持的方法返回错误）
 * - 未注册 Adapter 错误处理
 * - Adapter 实例缓存（同 providerId 复用）
 * - 配置变更后缓存失效
 * - ProviderError 透传
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── mock safeStorage ───
function createMockSafeStorage() {
  const store = new Map()
  let counter = 0
  return {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str) => {
      const key = `enc_${counter++}_${str}`
      store.set(key, str)
      return Buffer.from(key, 'utf-8')
    }),
    decryptString: vi.fn((buf) => {
      const key = buf.toString('utf-8')
      return store.get(key) || ''
    }),
  }
}

// ─── mock db ───
function createMockDb() {
  const tables = { model_providers: [] }

  function parseValues(valuesStr, args) {
    const values = []
    let current = ''
    let parenDepth = 0
    let inQuote = false
    let quoteChar = ''
    for (let i = 0; i < valuesStr.length; i++) {
      const ch = valuesStr[i]
      if (inQuote) {
        current += ch
        if (ch === quoteChar && valuesStr[i - 1] !== '\\') inQuote = false
        continue
      }
      if (ch === "'" || ch === '"') { inQuote = true; quoteChar = ch; current += ch; continue }
      if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
      if (ch === ',' && parenDepth === 0) { values.push(current.trim()); current = '' }
      else current += ch
    }
    if (current.trim()) values.push(current.trim())
    let argIdx = 0
    return values.map(v => {
      const t = v.trim()
      if (t === '?') return args[argIdx++]
      if (t === 'NULL' || t === 'null') return null
      if (t === "''" || t === '""') return ''
      if (t === '0' || t === '1') return parseInt(t, 10)
      if (/^-?\d+$/.test(t)) return parseInt(t, 10)
      if (t.toLowerCase().startsWith('datetime(')) return new Date().toISOString().replace('T', ' ').substring(0, 19)
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1)
      return t
    })
  }

  function parseWhere(whereClause, args) {
    const conditions = whereClause.split(/\s+AND\s+/i)
    let argIdx = 0
    return conditions.map(cond => {
      const t = cond.trim()
      let m = t.match(/^(\w+)\s*=\s*\?$/)
      if (m) return { col: m[1], op: '=', val: args[argIdx++] }
      m = t.match(/^(\w+)\s*!=\s*\?$/)
      if (m) return { col: m[1], op: '!=', val: args[argIdx++] }
      m = t.match(/^(\w+)\s+IS\s+NULL$/i)
      if (m) return { col: m[1], op: 'IS NULL' }
      m = t.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i)
      if (m) return { col: m[1], op: 'IS NOT NULL' }
      m = t.match(/^(\w+)\s*!=\s*''$/i)
      if (m) return { col: m[1], op: "!= ''" }
      m = t.match(/^(\w+)\s*=\s*'([^']*)'$/i)
      if (m) return { col: m[1], op: '=', val: m[2] }
      return null
    }).filter(Boolean)
  }

  function matchRow(row, conditions) {
    for (const c of conditions) {
      const rv = row[c.col]
      if (c.op === '=' && String(rv) !== String(c.val)) return false
      if (c.op === '!=' && String(rv) === String(c.val)) return false
      if (c.op === 'IS NULL' && rv != null) return false
      if (c.op === 'IS NOT NULL' && rv == null) return false
      if (c.op === "!= ''" && (rv == null || rv === '')) return false
    }
    return true
  }

  const db = {
    prepare: vi.fn((sql) => {
      const trimmed = sql.trim()
      const upper = trimmed.toUpperCase()
      return {
        run: vi.fn((...args) => {
          if (upper.startsWith('INSERT')) {
            const m = trimmed.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^]+)\)/i)
            if (m) {
              const table = m[1]
              const cols = m[2].split(',').map(c => c.trim())
              const values = parseValues(m[3], args)
              const row = {}
              for (let i = 0; i < cols.length; i++) row[cols[i]] = values[i]
              if (!tables[table]) tables[table] = []
              tables[table].push(row)
              return { changes: 1 }
            }
            return { changes: 0 }
          }
          if (upper.startsWith('UPDATE')) {
            const m = trimmed.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i)
            if (m) {
              const table = m[1]
              const setClause = m[2]
              const whereClause = m[3]
              const setParts = []
              let current = ''
              let parenDepth = 0
              for (const ch of setClause) {
                if (ch === '(') parenDepth++
                else if (ch === ')') parenDepth--
                if (ch === ',' && parenDepth === 0) { setParts.push(current.trim()); current = '' }
                else current += ch
              }
              if (current.trim()) setParts.push(current.trim())
              const whereQCount = (whereClause.match(/\?/g) || []).length
              const whereArgs = args.slice(args.length - whereQCount)
              const setArgs = args.slice(0, args.length - whereQCount)
              const setCols = []
              let setArgIdx = 0
              for (const part of setParts) {
                const colM = part.match(/^(\w+)\s*=\s*\?$/)
                if (colM) setCols.push({ col: colM[1], val: setArgs[setArgIdx++] })
              }
              const conditions = parseWhere(whereClause, whereArgs)
              let changes = 0
              for (const row of (tables[table] || [])) {
                if (matchRow(row, conditions)) {
                  for (const sc of setCols) row[sc.col] = sc.val
                  changes++
                }
              }
              return { changes }
            }
            return { changes: 0 }
          }
          if (upper.startsWith('DELETE')) {
            const m = trimmed.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)$/i)
            if (m) {
              const table = m[1]
              const whereClause = m[2]
              const whereQCount = (whereClause.match(/\?/g) || []).length
              const whereArgs = args.slice(args.length - whereQCount)
              const conditions = parseWhere(whereClause, whereArgs)
              const before = (tables[table] || []).length
              tables[table] = (tables[table] || []).filter(r => !matchRow(r, conditions))
              return { changes: before - tables[table].length }
            }
            return { changes: 0 }
          }
          return { changes: 0 }
        }),
        get: vi.fn((...args) => {
          if (upper.startsWith('SELECT')) {
            const tableMatch = trimmed.match(/FROM\s+(\w+)/i)
            if (!tableMatch) return undefined
            const table = tableMatch[1]
            const rows = tables[table] || []
            const countMatch = trimmed.match(/SELECT\s+COUNT\(\*\)\s+(?:as|AS)\s+(\w+)\s+FROM/i)
            if (countMatch) {
              const cntCol = countMatch[1]
              const whereMatch = trimmed.match(/WHERE\s+(.+)$/i)
              let filtered = rows
              if (whereMatch) {
                const conditions = parseWhere(whereMatch[1], args)
                filtered = rows.filter(r => matchRow(r, conditions))
              }
              const result = {}
              result[cntCol] = filtered.length
              return result
            }
            const whereMatch = trimmed.match(/WHERE\s+(.+)$/i)
            if (whereMatch) {
              let whereClause = whereMatch[1]
              const orderIdx = whereClause.toUpperCase().indexOf(' ORDER ')
              const limitIdx = whereClause.toUpperCase().indexOf(' LIMIT ')
              let endIdx = whereClause.length
              if (orderIdx > -1) endIdx = Math.min(endIdx, orderIdx)
              if (limitIdx > -1) endIdx = Math.min(endIdx, limitIdx)
              whereClause = whereClause.substring(0, endIdx).trim()
              const conditions = parseWhere(whereClause, args)
              return rows.find(r => matchRow(r, conditions)) || undefined
            }
            return rows[0]
          }
          return undefined
        }),
        all: vi.fn((...args) => {
          if (upper.startsWith('SELECT')) {
            const tableMatch = trimmed.match(/FROM\s+(\w+)/i)
            if (!tableMatch) return []
            const table = tableMatch[1]
            let rows = (tables[table] || []).slice()
            const whereMatch = trimmed.match(/WHERE\s+(.+)$/i)
            if (whereMatch) {
              let whereClause = whereMatch[1]
              const orderIdx = whereClause.toUpperCase().indexOf(' ORDER ')
              const limitIdx = whereClause.toUpperCase().indexOf(' LIMIT ')
              let endIdx = whereClause.length
              if (orderIdx > -1) endIdx = Math.min(endIdx, orderIdx)
              if (limitIdx > -1) endIdx = Math.min(endIdx, limitIdx)
              whereClause = whereClause.substring(0, endIdx).trim()
              const conditions = parseWhere(whereClause, args)
              rows = rows.filter(r => matchRow(r, conditions))
            }
            return rows
          }
          return []
        }),
      }
    }),
    exec: vi.fn(),
    transaction: vi.fn((fn) => fn),
    pragma: vi.fn(),
  }

  return { db, tables }
}

let manager, crypto, mockDb, mockTables

beforeEach(() => {
  __enableElectronMock()

  delete require.cache[require.resolve('./crypto')]
  crypto = require('./crypto')
  crypto.setSafeStorage(createMockSafeStorage())

  __registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
  __registerMock('./model-provider-seeds', {
    PRESET_PROVIDERS: [],
    CATEGORY_LABELS: { llm: 'LLM', tts: 'TTS', image: 'Image', video: 'Video', audio: 'Audio', speech_recognition: 'SR' },
    CATEGORIES: { LLM: 'llm', TTS: 'tts', IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio', SPEECH_RECOGNITION: 'speech_recognition' },
  })

  const mock = createMockDb()
  mockDb = mock.db
  mockTables = mock.tables

  delete require.cache[require.resolve('./model-provider-manager')]
  const { ModelProviderManager } = require('./model-provider-manager')
  manager = new ModelProviderManager({ db: mockDb, _ready: true })
  manager.init()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ModelProviderManager — P3.2 callAdapter 集成', () => {
  describe('registerAdapter — Adapter 注册', () => {
    it('注册 Adapter 工厂函数', () => {
      const factory = vi.fn(() => ({ id: 'openai', chatCompletion: vi.fn() }))
      manager.registerAdapter('openai', factory)
      expect(manager._adapterFactories.has('openai')).toBe(true)
    })
  })

  describe('callAdapter — 基础调用', () => {
    it('未注册 Adapter 返回错误', async () => {
      const result = await manager.callAdapter('nonexistent', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/no adapter.*registered/i)
    })

    it('provider 不存在返回错误', async () => {
      // 注册一个 Adapter 工厂
      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        chatCompletion: vi.fn(async () => 'ok'),
      }))

      const result = await manager.callAdapter('openai', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/not found/i)
    })

    it('成功调用 chatCompletion', async () => {
      // 先创建 provider
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test-12345', models: ['gpt-4o'],
      })

      // 注册 mock Adapter 工厂
      const mockChat = vi.fn(async () => ({ content: 'Hello!' }))
      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: mockChat,
      }))

      const result = await manager.callAdapter('openai', 'chatCompletion', {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.code).toBe(0)
      expect(result.data.content).toBe('Hello!')
      expect(mockChat).toHaveBeenCalledOnce()

      // 验证凭据注入
      const adapter = mockChat.mock.calls[0].thisArg || {}
      // 凭据应包含解密后的 api_key
      const factoryCall = manager._adapterFactories.get('openai').mock
      if (factoryCall) {
        const passedCreds = factoryCall.calls[0][0]
        expect(passedCreds.apiKey).toBe('sk-test-12345')
      }
    })

    it('Adapter 不支持的方法返回错误', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: vi.fn(async () => 'ok'),
      }))

      const result = await manager.callAdapter('openai', 'synthesize', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/not supported|capability/i)
    })
  })

  describe('callAdapter — 凭据注入', () => {
    it('从 api_key_enc 解密后传入 Adapter', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-secret-key', models: ['gpt-4o'],
      })

      let receivedCreds = null
      manager.registerAdapter('openai', (creds) => {
        receivedCreds = creds
        return {
          id: 'openai',
          credentials: creds,
          capabilities: () => ['listModels'],
          supports: (m) => m === 'listModels',
          listModels: vi.fn(async () => []),
        }
      })

      await manager.callAdapter('openai', 'listModels', {})
      expect(receivedCreds).toBeTruthy()
      expect(receivedCreds.apiKey).toBe('sk-secret-key')
      expect(receivedCreds.baseUrl).toBeDefined()
    })

    it('无 api_key 的 provider 调用时返回错误', async () => {
      manager.createProvider({
        id: 'no-key', name: 'No Key', category: 'llm',
        models: ['gpt-4o'],
      })

      manager.registerAdapter('no-key', (creds) => ({
        id: 'no-key',
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: vi.fn(async () => 'ok'),
      }))

      const result = await manager.callAdapter('no-key', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/api key|not configured/i)
    })
  })

  describe('callAdapter — 实例缓存', () => {
    it('同 providerId 多次调用复用 Adapter 实例', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      let factoryCallCount = 0
      manager.registerAdapter('openai', (creds) => {
        factoryCallCount++
        return {
          id: 'openai',
          credentials: creds,
          capabilities: () => ['chatCompletion'],
          supports: (m) => m === 'chatCompletion',
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      await manager.callAdapter('openai', 'chatCompletion', { messages: [] })

      expect(factoryCallCount).toBe(1)  // 工厂只调用一次
    })

    it('updateProvider 后缓存失效，重新创建 Adapter', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-old', models: ['gpt-4o'],
      })

      let factoryCallCount = 0
      let lastCreds = null
      manager.registerAdapter('openai', (creds) => {
        factoryCallCount++
        lastCreds = creds
        return {
          id: 'openai',
          credentials: creds,
          capabilities: () => ['chatCompletion'],
          supports: (m) => m === 'chatCompletion',
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      expect(factoryCallCount).toBe(1)
      expect(lastCreds.apiKey).toBe('sk-old')

      // 更新 API Key
      manager.updateProvider('openai', { api_key: 'sk-new' })

      await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      expect(factoryCallCount).toBe(2)  // 缓存失效，重新创建
      expect(lastCreds.apiKey).toBe('sk-new')
    })
  })

  describe('callAdapter — 错误透传', () => {
    it('ProviderError 透传给调用方', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-bad', models: ['gpt-4o'],
      })

      const { ProviderError, ERROR_CODES } = require('./adapters/provider-error')
      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: vi.fn(async () => {
          throw new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid API key')
        }),
      }))

      const result = await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      expect(result.code).toBe(-1)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('普通 Error 包装为友好错误', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: vi.fn(async () => {
          throw new Error('Unexpected error')
        }),
      }))

      const result = await manager.callAdapter('openai', 'chatCompletion', { messages: [] })
      expect(result.code).toBe(-1)
      expect(result.message).toContain('Unexpected error')
    })
  })

  describe('callAdapter — testConnection 升级', () => {
    it('testConnection 通过 callAdapter 调用 Adapter', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['testConnection'],
        supports: (m) => m === 'testConnection',
        testConnection: vi.fn(async () => ({ success: true, models: 5 })),
      }))

      const result = await manager.testConnection('openai')
      expect(result.code).toBe(0)
      expect(result.data.success).toBe(true)
      expect(result.data.models).toBe(5)
    })

    it('无 Adapter 注册时 fallback 到配置校验', async () => {
      // 使用 custom-llm 而非 openai（后者在 init() 中自动注册了内置 Adapter）
      manager.createProvider({
        id: 'custom-llm', name: 'CustomLLM', category: 'llm',
        api_key: 'sk-test', models: ['custom-model'],
      })

      // 不注册 Adapter
      const result = await manager.testConnection('custom-llm')
      expect(result.code).toBe(0)
      expect(result.message).toMatch(/config valid/i)
    })
  })

  // ─── P3.2 质量节拍补跑：边界场景 ───
  describe('P3.2 补跑：callAdapter store 未初始化', () => {
    it('manager._ready=false 时 callAdapter 返回错误', async () => {
      manager._ready = false
      const result = await manager.callAdapter('openai', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/not initialized/i)
    })

    it('manager._ready=false 时不访问 _adapterFactories', async () => {
      manager._ready = false
      // 清空 factories，确保不会被访问
      manager._adapterFactories.clear()
      const result = await manager.callAdapter('openai', 'chatCompletion', {})
      // 仍返回 store not initialized（而非 no adapter）
      expect(result.message).toMatch(/not initialized/i)
    })
  })

  describe('P3.2 补跑：registerAdapter 参数校验', () => {
    it('空 providerId 静默返回（不注册）', () => {
      const factory = vi.fn(() => ({}))
      manager.registerAdapter('', factory)
      expect(manager._adapterFactories.has('')).toBe(false)
    })

    it('null providerId 静默返回', () => {
      const factory = vi.fn(() => ({}))
      manager.registerAdapter(null, factory)
      expect(manager._adapterFactories.has(null)).toBe(false)
    })

    it('非 function factory 静默返回', () => {
      manager.registerAdapter('openai', 'not-a-function')
      // 即使之前注册过，也不应被覆盖
      const original = manager._adapterFactories.get('openai')
      manager.registerAdapter('openai', { foo: 'bar' })
      expect(manager._adapterFactories.get('openai')).toBe(original)
    })

    it('undefined factory 静默返回', () => {
      manager.registerAdapter('openai', undefined)
      const original = manager._adapterFactories.get('openai')
      expect(manager._adapterFactories.get('openai')).toBe(original)
    })
  })

  describe('P3.2 补跑：callAdapter params 默认 {}', () => {
    it('不传 params 参数时使用默认 {}', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      const mockChat = vi.fn(async (params) => ({ received: params }))
      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        capabilities: () => ['chatCompletion'],
        supports: (m) => m === 'chatCompletion',
        chatCompletion: mockChat,
      }))

      // 不传第三个参数
      const result = await manager.callAdapter('openai', 'chatCompletion')
      expect(result.code).toBe(0)
      expect(mockChat).toHaveBeenCalledOnce()
      // params 应为 {}
      expect(mockChat.mock.calls[0][0]).toEqual({})
    })
  })

  describe('P3.2 补跑：factory 同步抛异常', () => {
    it('factory 抛同步异常时 callAdapter 返回错误', async () => {
      manager.createProvider({
        id: 'crash-factory', name: 'CrashFactory', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      manager.registerAdapter('crash-factory', (creds) => {
        throw new Error('Factory initialization failed')
      })

      const result = await manager.callAdapter('crash-factory', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toContain('Factory initialization failed')
    })

    it('factory 抛 ProviderError 时透传', async () => {
      manager.createProvider({
        id: 'crash-pe', name: 'CrashPE', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      const { ProviderError, ERROR_CODES } = require('./adapters/provider-error')
      manager.registerAdapter('crash-pe', (creds) => {
        throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'Invalid credentials')
      })

      const result = await manager.callAdapter('crash-pe', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })

  describe('P3.2 补跑：adapter method 不存在', () => {
    it('adapter 上无该方法时 TypeError 被捕获', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      // 注册一个没有 streamChat 方法的 Adapter，且 supports 总是返回 true
      manager.registerAdapter('openai', (creds) => ({
        id: 'openai',
        credentials: creds,
        supports: () => true,  // 假装支持
        capabilities: () => ['chatCompletion'],
        chatCompletion: vi.fn(async () => 'ok'),
        // 注意：没有 streamChat 方法
      }))

      const result = await manager.callAdapter('openai', 'streamChat', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/streamChat|not a function|undefined/i)
    })
  })

  describe('P3.2 补跑：adapter.supports 不是 function', () => {
    it('supports 缺失时跳过能力检查直接调用', async () => {
      manager.createProvider({
        id: 'no-supports', name: 'NoSupports', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      const mockChat = vi.fn(async () => ({ ok: true }))
      manager.registerAdapter('no-supports', (creds) => ({
        id: 'no-supports',
        credentials: creds,
        // 没有 supports 方法
        chatCompletion: mockChat,
      }))

      const result = await manager.callAdapter('no-supports', 'chatCompletion', {})
      expect(result.code).toBe(0)
      expect(mockChat).toHaveBeenCalledOnce()
    })

    it('supports 为非 function（如 boolean）时跳过能力检查', async () => {
      manager.createProvider({
        id: 'bool-supports', name: 'BoolSupports', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      const mockChat = vi.fn(async () => ({ ok: true }))
      manager.registerAdapter('bool-supports', (creds) => ({
        id: 'bool-supports',
        credentials: creds,
        supports: true,  // 非 function
        chatCompletion: mockChat,
      }))

      const result = await manager.callAdapter('bool-supports', 'chatCompletion', {})
      expect(result.code).toBe(0)
      expect(mockChat).toHaveBeenCalledOnce()
    })
  })

  describe('P3.2 补跑：deleteProvider 缓存失效', () => {
    it('deleteProvider 后调用 callAdapter 返回 not found', async () => {
      manager.createProvider({
        id: 'temp', name: 'Temp', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      let factoryCallCount = 0
      manager.registerAdapter('temp', (creds) => {
        factoryCallCount++
        return {
          id: 'temp',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      // 第一次调用：创建并缓存
      await manager.callAdapter('temp', 'chatCompletion', {})
      expect(factoryCallCount).toBe(1)
      expect(manager._adapterCache.has('temp')).toBe(true)

      // 删除 provider
      manager.deleteProvider('temp')

      // 缓存应被清除
      expect(manager._adapterCache.has('temp')).toBe(false)

      // 再次调用：provider 不存在
      const result = await manager.callAdapter('temp', 'chatCompletion', {})
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/not found/i)
      // factory 不应被再次调用
      expect(factoryCallCount).toBe(1)
    })
  })

  describe('P3.2 补跑：重新注册 Adapter 覆盖', () => {
    it('重复注册同 providerId 覆盖原 factory 并清空缓存', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      let v1CallCount = 0
      let v2CallCount = 0
      manager.registerAdapter('openai', (creds) => {
        v1CallCount++
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'v1'),
        }
      })

      // 第一次调用 v1
      await manager.callAdapter('openai', 'chatCompletion', {})
      expect(v1CallCount).toBe(1)

      // 重新注册 v2
      manager.registerAdapter('openai', (creds) => {
        v2CallCount++
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'v2'),
        }
      })

      // v1 不应被再次调用，v2 应被调用
      const result = await manager.callAdapter('openai', 'chatCompletion', {})
      expect(v1CallCount).toBe(1)
      expect(v2CallCount).toBe(1)
      expect(result.data).toBe('v2')
    })
  })

  describe('P3.2 补跑：_invalidateAdapterCache 直接调用', () => {
    it('_invalidateAdapterCache 清除指定 provider 缓存', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      let factoryCallCount = 0
      manager.registerAdapter('openai', (creds) => {
        factoryCallCount++
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      // 第一次调用：缓存创建
      await manager.callAdapter('openai', 'chatCompletion', {})
      expect(factoryCallCount).toBe(1)
      expect(manager._adapterCache.has('openai')).toBe(true)

      // 手动清除缓存
      manager._invalidateAdapterCache('openai')
      expect(manager._adapterCache.has('openai')).toBe(false)

      // 再次调用：factory 重新调用
      await manager.callAdapter('openai', 'chatCompletion', {})
      expect(factoryCallCount).toBe(2)
    })

    it('_invalidateAdapterCache 对未缓存 provider 不抛错', () => {
      expect(() => manager._invalidateAdapterCache('never-cached')).not.toThrow()
    })
  })

  describe('P3.2 补跑：callAdapter credentials 字段完整', () => {
    it('credentials 包含 id/apiKey/baseUrl/models/config', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', base_url: 'https://custom.api/v1',
        models: ['gpt-4o', 'gpt-4o-mini'],
        config: { timeout: 5000 },
      })

      let receivedCreds = null
      manager.registerAdapter('openai', (creds) => {
        receivedCreds = creds
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          listModels: vi.fn(async () => []),
        }
      })

      await manager.callAdapter('openai', 'listModels', {})
      expect(receivedCreds.id).toBe('openai')
      expect(receivedCreds.apiKey).toBe('sk-test')
      expect(receivedCreds.baseUrl).toBe('https://custom.api/v1')
      expect(receivedCreds.models).toEqual(['gpt-4o', 'gpt-4o-mini'])
      expect(receivedCreds.config).toEqual({ timeout: 5000 })
    })

    it('provider 无 base_url 时 credentials.baseUrl 为 undefined', async () => {
      manager.createProvider({
        id: 'no-base', name: 'NoBase', category: 'llm',
        api_key: 'sk-test', models: ['m'],
      })

      let receivedCreds = null
      manager.registerAdapter('no-base', (creds) => {
        receivedCreds = creds
        return {
          id: 'no-base',
          credentials: creds,
          supports: () => true,
          listModels: vi.fn(async () => []),
        }
      })

      await manager.callAdapter('no-base', 'listModels', {})
      // mock db 默认插入空字符串，manager 也可能传 undefined，两者都视为未配置
      expect(receivedCreds.baseUrl).toBeFalsy()
    })

    it('credentials 突变不污染 manager 内部状态', async () => {
      manager.createProvider({
        id: 'openai', name: 'OpenAI', category: 'llm',
        api_key: 'sk-test', models: ['gpt-4o'],
      })

      let capturedCreds = null
      manager.registerAdapter('openai', (creds) => {
        capturedCreds = creds
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      await manager.callAdapter('openai', 'chatCompletion', {})

      // 突变 credentials
      capturedCreds.apiKey = 'tampered'
      capturedCreds.models.push('injected')

      // 重新创建 Adapter（通过清除缓存）应使用原始值
      manager._invalidateAdapterCache('openai')
      let newCreds = null
      manager.registerAdapter('openai', (creds) => {
        newCreds = creds
        return {
          id: 'openai',
          credentials: creds,
          supports: () => true,
          chatCompletion: vi.fn(async () => 'ok'),
        }
      })

      await manager.callAdapter('openai', 'chatCompletion', {})
      expect(newCreds.apiKey).toBe('sk-test')
      // models 数组也应是新的（不应被 push 污染）
      expect(newCreds.models).not.toContain('injected')
    })
  })
})
