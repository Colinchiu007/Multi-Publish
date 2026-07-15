// @ts-check
/**
 * model-provider-crypto.test.js — P2 manager 加密集成测试
 *
 * 验证 manager 与 crypto.js 的集成：
 * - createProvider 加密 api_key → api_key_enc
 * - getProviderWithKey 解密返回明文
 * - _safeRow 返回 api_key_masked 遮罩
 * - updateProvider 加密更新
 * - 迁移脚本：明文 api_key → 加密 api_key_enc
 * - safeStorage 不可用时拒绝存储
 *
 * 使用 mock db 模拟 SQLite，专注验证加密逻辑
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

// ─── mock db（内存表模拟，支持完整 SQL 解析）───
function createMockDb() {
  const tables = { model_providers: [] }

  // 解析 VALUES 子句，正确处理字面量与参数混合
  // 例：VALUES (?, ?, ?, ?, '', ?, ?, 0, datetime('now'))
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
      if (ch === "'" || ch === '"') {
        inQuote = true
        quoteChar = ch
        current += ch
        continue
      }
      if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
      if (ch === ',' && parenDepth === 0) {
        values.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) values.push(current.trim())

    // 将每个值转换为实际 JS 值
    let argIdx = 0
    return values.map(v => {
      const trimmed = v.trim()
      if (trimmed === '?') return args[argIdx++]
      if (trimmed === 'NULL' || trimmed === 'null') return null
      if (trimmed === "''" || trimmed === '""') return ''
      if (trimmed === '0' || trimmed === '1') return parseInt(trimmed, 10)
      if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10)
      if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed)
      if (trimmed.toLowerCase().startsWith('datetime(')) {
        return new Date().toISOString().replace('T', ' ').substring(0, 19)
      }
      // 字符串字面量
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
          (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.slice(1, -1)
      }
      return trimmed
    })
  }

  // 解析 WHERE 子句，支持 AND 连接的多条件
  function parseWhere(whereClause, args) {
    // 拆分 AND 条件（不拆分 OR）
    const conditions = whereClause.split(/\s+AND\s+/i)
    let argIdx = 0
    return conditions.map(cond => {
      const trimmed = cond.trim()
      // col = ?
      let m = trimmed.match(/^(\w+)\s*=\s*\?$/)
      if (m) return { col: m[1], op: '=', val: args[argIdx++] }
      // col != ?
      m = trimmed.match(/^(\w+)\s*!=\s*\?$/)
      if (m) return { col: m[1], op: '!=', val: args[argIdx++] }
      // col IS NULL
      m = trimmed.match(/^(\w+)\s+IS\s+NULL$/i)
      if (m) return { col: m[1], op: 'IS NULL' }
      // col IS NOT NULL
      m = trimmed.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i)
      if (m) return { col: m[1], op: 'IS NOT NULL' }
      // col != ''（非空字符串）
      m = trimmed.match(/^(\w+)\s*!=\s*''$/i)
      if (m) return { col: m[1], op: "!= ''" }
      // col = 'value'
      m = trimmed.match(/^(\w+)\s*=\s*'([^']*)'$/i)
      if (m) return { col: m[1], op: '=', val: m[2] }
      return null
    }).filter(Boolean)
  }

  function matchRow(row, conditions) {
    for (const cond of conditions) {
      const rowVal = row[cond.col]
      if (cond.op === '=' && String(rowVal) !== String(cond.val)) return false
      if (cond.op === '!=' && String(rowVal) === String(cond.val)) return false
      if (cond.op === 'IS NULL' && rowVal != null) return false
      if (cond.op === 'IS NOT NULL' && rowVal == null) return false
      if (cond.op === "!= ''" && (rowVal == null || rowVal === '')) return false
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
            // INSERT INTO table (col1, col2, ...) VALUES (val1, val2, ...)
            // 注意：VALUES 后的内容可能包含括号内的逗号（如 datetime('now')）
            const colsMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^]+)\)/i)
            if (colsMatch) {
              const table = colsMatch[1]
              const cols = colsMatch[2].split(',').map(c => c.trim())
              const valuesStr = colsMatch[3]
              const values = parseValues(valuesStr, args)
              const row = {}
              for (let i = 0; i < cols.length; i++) {
                row[cols[i]] = values[i]
              }
              if (!tables[table]) tables[table] = []
              tables[table].push(row)
              return { changes: 1 }
            }
            return { changes: 0 }
          }
          if (upper.startsWith('UPDATE')) {
            // UPDATE table SET col1 = ?, col2 = ? WHERE ...
            const m = trimmed.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i)
            if (m) {
              const table = m[1]
              const setClause = m[2]
              const whereClause = m[3]
              // 解析 SET 子句：col1 = ?, col2 = ?
              const setParts = []
              let current = ''
              let parenDepth = 0
              for (const ch of setClause) {
                if (ch === '(') parenDepth++
                else if (ch === ')') parenDepth--
                if (ch === ',' && parenDepth === 0) {
                  setParts.push(current.trim())
                  current = ''
                } else {
                  current += ch
                }
              }
              if (current.trim()) setParts.push(current.trim())

              // WHERE 条件中的参数数量（计算 ? 个数）
              const whereQuestionCount = (whereClause.match(/\?/g) || []).length
              const whereArgs = args.slice(args.length - whereQuestionCount)
              const setArgs = args.slice(0, args.length - whereQuestionCount)

              const setCols = []
              let setArgIdx = 0
              for (const part of setParts) {
                const colM = part.match(/^(\w+)\s*=\s*\?$/)
                if (colM) {
                  setCols.push({ col: colM[1], val: setArgs[setArgIdx++] })
                }
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
              const whereQuestionCount = (whereClause.match(/\?/g) || []).length
              const whereArgs = args.slice(args.length - whereQuestionCount)
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

            // SELECT COUNT(*) as cnt FROM ... WHERE ...
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

            // SELECT * FROM table WHERE ...
            const whereMatch = trimmed.match(/WHERE\s+(.+)$/i)
            if (whereMatch) {
              // 去掉 ORDER BY / LIMIT 等后续子句
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
              // 去掉 ORDER BY / LIMIT 等后续子句
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

  // 注入 mock safeStorage 到 crypto
  delete require.cache[require.resolve('./crypto')]
  crypto = require('./crypto')
  crypto.setSafeStorage(createMockSafeStorage())

  // mock logger
  __registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

  // mock model-provider-seeds（避免 _seedPresets 污染 mock db）
  __registerMock('./model-provider-seeds', {
    PRESET_PROVIDERS: [],
    CATEGORY_LABELS: { llm: 'LLM', tts: 'TTS', image: 'Image', video: 'Video', audio: 'Audio', speech_recognition: 'SR' },
    CATEGORIES: { LLM: 'llm', TTS: 'tts', IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio', SPEECH_RECOGNITION: 'speech_recognition' },
  })

  // 创建 mock db
  const mock = createMockDb()
  mockDb = mock.db
  mockTables = mock.tables

  // 创建 manager
  delete require.cache[require.resolve('./model-provider-manager')]
  const { ModelProviderManager } = require('./model-provider-manager')
  manager = new ModelProviderManager({ db: mockDb, _ready: true })
  manager.init()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ModelProviderManager — P2 加密集成', () => {
  describe('createProvider 加密', () => {
    it('createProvider 加密 api_key 到 api_key_enc', () => {
      const result = manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-test-key-12345',
        models: ['gpt-4o'],
      })
      expect(result.code).toBe(0)

      // 数据库中 api_key 应为空，api_key_enc 应有值
      const row = mockTables.model_providers.find(r => r.id === 'test-provider')
      expect(row.api_key).toBe('')
      expect(row.api_key_enc).toBeTruthy()
      expect(Buffer.isBuffer(row.api_key_enc)).toBe(true)
    })

    it('createProvider 无 api_key 时不加密', () => {
      const result = manager.createProvider({
        id: 'no-key-provider',
        name: 'No Key Provider',
        category: 'llm',
        models: ['gpt-4o'],
      })
      expect(result.code).toBe(0)

      const row = mockTables.model_providers.find(r => r.id === 'no-key-provider')
      expect(row.api_key).toBe('')
      expect(row.api_key_enc).toBeNull()
    })

    it('safeStorage 不可用时 createProvider 返回错误', () => {
      crypto.setSafeStorage(null)
      const result = manager.createProvider({
        id: 'no-safe-provider',
        name: 'No Safe Provider',
        category: 'llm',
        api_key: 'sk-test-key',
        models: ['gpt-4o'],
      })
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/safeStorage|加密/i)
    })
  })

  describe('getProviderWithKey 解密', () => {
    it('getProviderWithKey 解密返回明文 api_key', () => {
      manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-test-key-12345',
        models: ['gpt-4o'],
      })

      const provider = manager.getProviderWithKey('test-provider')
      expect(provider).toBeTruthy()
      expect(provider.api_key).toBe('sk-test-key-12345')
    })

    it('getProviderWithKey 无 api_key_enc 返回空', () => {
      manager.createProvider({
        id: 'no-key-provider',
        name: 'No Key Provider',
        category: 'llm',
        models: ['gpt-4o'],
      })

      const provider = manager.getProviderWithKey('no-key-provider')
      expect(provider.api_key).toBe('')
    })
  })

  describe('_safeRow 返回遮罩', () => {
    it('getProvider 返回 api_key_masked 遮罩', () => {
      manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-1234567890abcdef',
        models: ['gpt-4o'],
      })

      const provider = manager.getProvider('test-provider')
      expect(provider.api_key_masked).toBe('sk-1****cdef')
      expect(provider.api_key).toBeUndefined()
    })

    it('getProvider 无 api_key 时 api_key_masked 为 ****', () => {
      manager.createProvider({
        id: 'no-key-provider',
        name: 'No Key Provider',
        category: 'llm',
        models: ['gpt-4o'],
      })

      const provider = manager.getProvider('no-key-provider')
      expect(provider.api_key_masked).toBe('****')
    })
  })

  describe('updateProvider 加密更新', () => {
    it('updateProvider 加密新 api_key', () => {
      manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-old-key-12345',
        models: ['gpt-4o'],
      })

      const result = manager.updateProvider('test-provider', { api_key: 'sk-new-key-67890' })
      expect(result.code).toBe(0)

      const row = mockTables.model_providers.find(r => r.id === 'test-provider')
      expect(row.api_key).toBe('')
      expect(row.api_key_enc).toBeTruthy()

      const provider = manager.getProviderWithKey('test-provider')
      expect(provider.api_key).toBe('sk-new-key-67890')
    })

    it('updateProvider 清空 api_key', () => {
      manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-test-key-12345',
        models: ['gpt-4o'],
      })

      const result = manager.updateProvider('test-provider', { api_key: '' })
      expect(result.code).toBe(0)

      const row = mockTables.model_providers.find(r => r.id === 'test-provider')
      expect(row.api_key).toBe('')
    })
  })

  describe('isConfigured 检查加密字段', () => {
    it('isConfigured 检查 api_key_enc 而非 api_key', () => {
      manager.createProvider({
        id: 'test-provider',
        name: 'Test Provider',
        category: 'llm',
        api_key: 'sk-test-key-12345',
        models: ['gpt-4o'],
      })

      manager.updateProvider('test-provider', { enabled: true })
      expect(manager.isConfigured('llm')).toBe(true)
    })

    it('isConfigured 无加密 key 返回 false', () => {
      manager.createProvider({
        id: 'no-key-provider',
        name: 'No Key Provider',
        category: 'llm',
        models: ['gpt-4o'],
      })
      manager.updateProvider('no-key-provider', { enabled: true })
      expect(manager.isConfigured('llm')).toBe(false)
    })
  })
})
