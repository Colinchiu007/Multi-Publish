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

function fakeClient(existing = []) {
  const calls = []
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values })
      if (/SELECT name, checksum FROM identity_schema_migrations/.test(text)) return { rows: existing }
      if (/to_regclass/.test(text)) return { rows: [{ relation: existing.length ? 'identity_schema_migrations' : null }] }
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

  await t.test('重复执行跳过已应用 migration', async () => {
    const directory = migrationDirectory()
    const discovered = discoverMigrations(directory)
    const client = fakeClient(discovered.map(({ name, checksum }) => ({ name, checksum })))
    const result = await runMigrations({ client, directory })

    assert.deepStrictEqual(result.applied, [])
    assert.deepStrictEqual(result.skipped, ['002_first.sql', '003_second.sql'])
    assert.strictEqual(client.calls.some((call) => call.text === 'SELECT 2;\n'), false)
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

    assert.deepStrictEqual(result.pending, ['002_first.sql', '003_second.sql'])
    assert.strictEqual(client.calls.some((call) => /CREATE TABLE/.test(call.text)), false)
    assert.strictEqual(client.calls.some((call) => call.text === 'SELECT 2;\n'), false)
  })
})
