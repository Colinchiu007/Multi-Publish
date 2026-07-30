const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

function migrationDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-migrations-'))
  fs.writeFileSync(path.join(directory, '002_first.sql'), 'SELECT 2;\n')
  fs.writeFileSync(path.join(directory, '003_second.sql'), 'SELECT 3;\n')
  return directory
}

function fakeClient(existing = [], options = {}) {
  const calls = []
  const tableExists = options.tableExists ?? existing.length > 0
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values })
      if (/CREATE TABLE IF NOT EXISTS identity_schema_migrations/.test(text) && options.rejectCreate) {
        throw Object.assign(new Error('permission denied for schema public'), { code: '42501' })
      }
      if (/SELECT name, checksum FROM identity_schema_migrations/.test(text)) return { rows: existing }
      if (/to_regclass/.test(text)) return { rows: [{ relation: tableExists ? 'identity_schema_migrations' : null }] }
      return { rows: [] }
    },
  }
}

test('PostgreSQL migration runner', async (t) => {
  const { MigrationError, discoverMigrations, normalizeMigrationSql, runMigrations } = require('../src/auth/postgres-migrations')

  await t.test('去除 migration 自带事务外壳后由 runner 统一提交 ledger', () => {
    assert.strictEqual(normalizeMigrationSql('-- header\nBEGIN;\nSELECT 1;\nCOMMIT;\n'), 'SELECT 1;')
  })

  await t.test('按文件名顺序执行、记录 checksum，并始终释放 advisory lock', async () => {
    const directory = migrationDirectory()
    const client = fakeClient()
    const result = await runMigrations({ client, directory })

    assert.deepStrictEqual(result.applied, ['002_first.sql', '003_second.sql'])
    const sql = client.calls.map((call) => call.text)
    assert.match(sql[0], /pg_advisory_lock/)
    assert(sql.indexOf('SELECT 2;\n') < sql.indexOf('SELECT 3;\n'))
    assert.strictEqual(sql.filter((value) => /INSERT INTO identity_schema_migrations/.test(value)).length, 2)
    assert.match(sql.at(-1), /pg_advisory_unlock/)
  })

  await t.test('正式 runner 在 ledger 已存在且无 pending 时不要求 schema CREATE 权限', async () => {
    const directory = migrationDirectory()
    const discovered = discoverMigrations(directory)
    const client = fakeClient(
      discovered.map(({ name, checksum }) => ({ name, checksum })),
      { tableExists: true, rejectCreate: true },
    )
    const result = await runMigrations({ client, directory })

    assert.deepStrictEqual(result, {
      applied: [],
      skipped: ['002_first.sql', '003_second.sql'],
      pending: [],
    })
    const sql = client.calls.map((call) => call.text)
    assert.deepStrictEqual(sql, [
      'SELECT pg_advisory_lock($1)',
      "SELECT to_regclass('public.identity_schema_migrations') AS relation",
      'SELECT name, checksum FROM identity_schema_migrations ORDER BY name',
      'SELECT pg_advisory_unlock($1)',
    ])
    assert.strictEqual(sql.some((value) => /CREATE TABLE/.test(value)), false)
  })

  await t.test('正式 runner 在 ledger 缺失时创建 ledger 后应用 migration', async () => {
    const directory = migrationDirectory()
    const client = fakeClient([], { tableExists: false })
    const result = await runMigrations({ client, directory })

    assert.deepStrictEqual(result.applied, ['002_first.sql', '003_second.sql'])
    const sql = client.calls.map((call) => call.text)
    const lockIndex = sql.findIndex((value) => /pg_advisory_lock/.test(value))
    const probeIndex = sql.indexOf("SELECT to_regclass('public.identity_schema_migrations') AS relation")
    const createIndex = sql.findIndex((value) => /CREATE TABLE IF NOT EXISTS identity_schema_migrations/.test(value))
    const ledgerIndex = sql.indexOf('SELECT name, checksum FROM identity_schema_migrations ORDER BY name')
    const firstMigrationIndex = sql.indexOf('SELECT 2;\n')
    assert.deepStrictEqual(
      [lockIndex, probeIndex, createIndex, ledgerIndex, firstMigrationIndex],
      [0, 1, 2, 3, 5],
    )
    assert.match(sql.at(-1), /pg_advisory_unlock/)
  })

  await t.test('正式 runner 在 ledger 缺失且无 CREATE 权限时失败并释放 advisory lock', async () => {
    const directory = migrationDirectory()
    const client = fakeClient([], { tableExists: false, rejectCreate: true })

    await assert.rejects(runMigrations({ client, directory }), (error) => error.code === '42501')
    const sql = client.calls.map((call) => call.text)
    const normalizedSql = sql.map((value) => (
      /CREATE TABLE IF NOT EXISTS identity_schema_migrations/.test(value) ? 'CREATE_LEDGER' : value
    ))
    assert.deepStrictEqual(normalizedSql, [
      'SELECT pg_advisory_lock($1)',
      "SELECT to_regclass('public.identity_schema_migrations') AS relation",
      'CREATE_LEDGER',
      'SELECT pg_advisory_unlock($1)',
    ])
    assert.strictEqual(sql.some((value) => value === 'BEGIN' || /INSERT INTO identity_schema_migrations/.test(value)), false)
    assert.strictEqual(sql.some((value) => value === 'SELECT 2;\n' || value === 'SELECT 3;\n'), false)
  })

  await t.test('已应用文件 checksum 漂移时拒绝执行', async () => {
    const directory = migrationDirectory()
    const client = fakeClient([{ name: '002_first.sql', checksum: 'wrong-checksum' }])
    await assert.rejects(runMigrations({ client, directory }), (error) => {
      return error instanceof MigrationError && error.code === 'MIGRATION_CHECKSUM_MISMATCH'
    })
    assert.match(client.calls.at(-1).text, /pg_advisory_unlock/)
  })

  await t.test('ledger 引用了部署包中不存在的 migration 时拒绝继续', async () => {
    const directory = migrationDirectory()
    const client = fakeClient([{ name: '001_removed.sql', checksum: 'a'.repeat(64) }])

    await assert.rejects(runMigrations({ client, directory }), (error) => {
      return error instanceof MigrationError && error.code === 'MIGRATION_FILE_MISSING'
    })
    assert.match(client.calls.at(-1).text, /pg_advisory_unlock/)
  })

  await t.test('migration SQL 失败时不写 ledger 并释放 advisory lock', async () => {
    const directory = migrationDirectory()
    const client = fakeClient()
    const originalQuery = client.query.bind(client)
    client.query = async (text, values) => {
      if (text === 'SELECT 2;\n') {
        client.calls.push({ text, values })
        throw Object.assign(new Error('测试 SQL 执行失败'), { code: 'FIXTURE_SQL_FAILED' })
      }
      return originalQuery(text, values)
    }

    await assert.rejects(runMigrations({ client, directory }), (error) => error.code === 'FIXTURE_SQL_FAILED')
    assert.strictEqual(client.calls.some((call) => /INSERT INTO identity_schema_migrations/.test(call.text)), false)
    assert(client.calls.some((call) => call.text === 'BEGIN'))
    assert(client.calls.some((call) => call.text === 'ROLLBACK'))
    assert.match(client.calls.at(-1).text, /pg_advisory_unlock/)
  })

  await t.test('dry-run 不创建 ledger、不执行 SQL，只返回待应用清单', async () => {
    const directory = migrationDirectory()
    const client = fakeClient()
    const result = await runMigrations({ client, directory, dryRun: true })

    assert.deepStrictEqual(result, {
      applied: [],
      skipped: [],
      pending: ['002_first.sql', '003_second.sql'],
    })
    assert.deepStrictEqual(client.calls.map((call) => call.text), [
      'SELECT pg_advisory_lock($1)',
      "SELECT to_regclass('public.identity_schema_migrations') AS relation",
      'SELECT pg_advisory_unlock($1)',
    ])
  })
})
