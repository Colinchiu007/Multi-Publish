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
})
