const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MIGRATION_LOCK_ID = 1431325501
const MIGRATION_PATTERN = /^\d{3}_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/

class MigrationError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function discoverMigrations(directory) {
  const resolved = path.resolve(directory)
  return fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_PATTERN.test(entry.name))
    .map((entry) => {
      const file = path.join(resolved, entry.name)
      const sql = fs.readFileSync(file, 'utf8')
      return { name: entry.name, file, sql, checksum: checksum(sql) }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeMigrationSql(sql) {
  if (typeof sql !== 'string') throw new MigrationError('MIGRATION_SQL_INVALID', 'Migration SQL 无效')
  const trimmed = sql.trim()
  const beginMatch = /^(?:(?:--[^\r\n]*(?:\r?\n|$))|\s)*BEGIN\s*;\s*/i.exec(trimmed)
  if (!beginMatch) {
    if (/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(trimmed)) throw new MigrationError('MIGRATION_TRANSACTION_CONTROL_UNSUPPORTED', '事务控制语句必须包裹整个 migration 文件')
    return sql
  }
  const bodyWithCommit = trimmed.slice(beginMatch[0].length)
  const commitMatch = /\s*COMMIT\s*;\s*$/i.exec(bodyWithCommit)
  if (!commitMatch) throw new MigrationError('MIGRATION_TRANSACTION_ENVELOPE_INVALID', 'Migration 事务外壳无效')
  const body = bodyWithCommit.slice(0, commitMatch.index).trim()
  if (!body || /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(body)) {
    throw new MigrationError('MIGRATION_TRANSACTION_ENVELOPE_INVALID', 'Migration 事务外壳无效')
  }
  return body
}

function validateMigrationLedger(migrations, applied, options = {}) {
  const allowPending = options.allowPending !== false
  const current = new Map(migrations.map((migration) => [migration.name, migration]))
  const seen = new Set()
  for (const entry of applied || []) {
    if (!entry || typeof entry.name !== 'string' || !MIGRATION_PATTERN.test(entry.name) || typeof entry.checksum !== 'string') {
      throw new MigrationError('MIGRATION_LEDGER_INVALID', 'Migration ledger 记录无效')
    }
    if (seen.has(entry.name)) throw new MigrationError('MIGRATION_LEDGER_INVALID', `Migration ledger 记录重复：${entry.name}`)
    seen.add(entry.name)
    const migration = current.get(entry.name)
    if (!migration) throw new MigrationError('MIGRATION_FILE_MISSING', `缺少 migration 文件：${entry.name}`)
    if (migration.checksum !== entry.checksum) {
      throw new MigrationError('MIGRATION_CHECKSUM_MISMATCH', `Migration checksum 不匹配：${entry.name}`)
    }
  }
  const pending = migrations.filter((migration) => !seen.has(migration.name)).map((migration) => migration.name)
  if (!allowPending && pending.length > 0) {
    throw new MigrationError('MIGRATION_PENDING', `存在待执行的 migration：${pending[0]}`)
  }
  return {
    pending,
    applied: migrations.filter((migration) => seen.has(migration.name)).map((migration) => migration.name),
  }
}

async function loadApplied(client, dryRun) {
  if (dryRun) {
    const table = await client.query("SELECT to_regclass('public.identity_schema_migrations') AS relation")
    if (!table.rows || !table.rows[0] || !table.rows[0].relation) return []
  } else {
    await client.query(`CREATE TABLE IF NOT EXISTS identity_schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  }
  const result = await client.query('SELECT name, checksum FROM identity_schema_migrations ORDER BY name')
  return result.rows || []
}

async function runMigrations(options = {}) {
  const { client, directory, dryRun = false } = options
  if (!client || typeof client.query !== 'function') throw new TypeError('必须提供 PostgreSQL 客户端')
  if (typeof directory !== 'string' || !directory) throw new TypeError('必须提供 migration 目录')
  const migrations = discoverMigrations(directory)
  const result = { applied: [], skipped: [], pending: [] }

  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
  try {
    const applied = await loadApplied(client, dryRun)
    validateMigrationLedger(migrations, applied)
    const byName = new Map(applied.map((entry) => [entry.name, entry.checksum]))
    for (const migration of migrations) {
      const knownChecksum = byName.get(migration.name)
      if (knownChecksum && knownChecksum !== migration.checksum) {
        throw new MigrationError('MIGRATION_CHECKSUM_MISMATCH', `Migration checksum 不匹配：${migration.name}`)
      }
      if (knownChecksum) {
        result.skipped.push(migration.name)
        continue
      }
      if (dryRun) {
        result.pending.push(migration.name)
        continue
      }
      let transactionStarted = false
      try {
        await client.query('BEGIN')
        transactionStarted = true
        await client.query(normalizeMigrationSql(migration.sql))
        await client.query(
          'INSERT INTO identity_schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        if (transactionStarted) await client.query('ROLLBACK').catch(() => {})
        throw error
      }
      result.applied.push(migration.name)
    }
    return result
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
  }
}

module.exports = { MIGRATION_LOCK_ID, MigrationError, checksum, discoverMigrations, normalizeMigrationSql, runMigrations, validateMigrationLedger }
