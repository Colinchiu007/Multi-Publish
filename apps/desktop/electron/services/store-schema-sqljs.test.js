// @ts-check
/**
 * store-schema-sqljs.test.js - sql.js 兼容性回归测试
 *
 * 根因：DEFAULT (datetime("now")) 在 better-sqlite3 中可用，但 sql.js 不支持。
 * 迁移到 sql.js 时没有真实执行 schema SQL 校验，导致建表问题逃逸。
 *
 * 本测试用 sql.js 实际执行 SCHEMA_SQL，确保语法兼容。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import initSqlJs from 'sql.js'

let SQL
let db

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  db = new SQL.Database()
})

afterEach(() => {
  if (db) db.close()
})

describe('store-schema sql.js compatibility', function () {

  it('all CREATE TABLE statements execute without errors in sql.js', async function () {
    const { SCHEMA_SQL } = await import('./store-schema')
    const errors = []
    for (const sql of SCHEMA_SQL) {
      try {
        db.exec(sql)
      } catch (e) {
        errors.push({ sql: sql.substring(0, 80), error: e.message })
      }
    }
    expect(errors).toEqual([])
  })

  it('model_providers table: INSERT and SELECT work after schema creation', async function () {
    const { SCHEMA_SQL } = await import('./store-schema')
    for (const sql of SCHEMA_SQL) db.exec(sql)

    db.run(
      'INSERT INTO model_providers (id, name, category, base_url, api_key, api_key_enc, models, enabled, is_default, is_preset, config, created_at, updated_at) VALUES (?, ?, ?, ?, "", NULL, ?, 0, 0, 1, "{}", datetime("now"), datetime("now"))',
      ['deepseek', 'DeepSeek', 'llm', 'https://api.deepseek.com', '["deepseek-chat"]']
    )

    const result = db.exec('SELECT id, name, category FROM model_providers WHERE id = ?', ['deepseek'])
    expect(result.length).toBe(1)
    expect(result[0].values[0]).toEqual(['deepseek', 'DeepSeek', 'llm'])
  })

  it('model_provider_logs table: INSERT works', async function () {
    const { SCHEMA_SQL } = await import('./store-schema')
    for (const sql of SCHEMA_SQL) db.exec(sql)

    db.run(
      'INSERT INTO model_provider_logs (provider_id, category, model, action, status, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))',
      ['deepseek', 'llm', 'deepseek-chat', 'chat', 'success', 150]
    )

    const result = db.exec('SELECT COUNT(*) as cnt FROM model_provider_logs')
    expect(result[0].values[0][0]).toBe(1)
  })

  it('accounts table: INSERT with datetime works', async function () {
    const { SCHEMA_SQL } = await import('./store-schema')
    for (const sql of SCHEMA_SQL) db.exec(sql)

    db.run(
      'INSERT INTO accounts (platform, account_name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      ['wechat', 'test']
    )

    const result = db.exec('SELECT platform FROM accounts')
    expect(result[0].values[0][0]).toBe('wechat')
  })

  it('no DEFAULT (expression) syntax remains in SCHEMA_SQL', async function () {
    const { SCHEMA_SQL } = await import('./store-schema')
    const violations = []
    for (const sql of SCHEMA_SQL) {
      const upper = sql.toUpperCase()
      if (upper.includes('DEFAULT') && upper.includes('DATETIME') && upper.includes('(DATETIME')) {
        violations.push(sql.substring(0, 60))
      }
    }
    expect(violations).toEqual([])
  })

})
