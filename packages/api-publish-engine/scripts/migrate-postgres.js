#!/usr/bin/env node
const path = require('path')
const { Client } = require('pg')
const { runMigrations } = require('../src/auth/postgres-migrations')

function parseArgs(argv = process.argv.slice(2)) {
  const defaultDirectory = path.resolve(__dirname, '../../../migrations/postgresql')
  const result = { dryRun: false, directory: defaultDirectory, error: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') result.dryRun = true
    else if (arg === '--directory' && argv[index + 1]) {
      const requested = path.resolve(argv[++index])
      if (requested !== defaultDirectory) result.error = 'MIGRATION_DIRECTORY_FORBIDDEN'
      else result.directory = requested
    }
    else if (arg === '--database-url' && argv[index + 1]) result.databaseUrl = argv[++index]
    else if (arg === '--help' || arg === '-h') result.help = true
    else result.error = 'MIGRATION_ARGUMENT_INVALID'
  }
  return result
}

async function main(options = parseArgs()) {
  if (options.help) {
    console.log('用法: migrate-postgres [--dry-run] [--database-url URL]')
    return 0
  }
  if (options.error) {
    console.error(options.error)
    return 2
  }
  const databaseUrl = options.databaseUrl || process.env.BUSINESS_DATABASE_URL
  if (!databaseUrl) {
    console.error('MIGRATION_DATABASE_URL_REQUIRED')
    return 2
  }
  const client = new Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    const result = await runMigrations({ client, directory: options.directory, dryRun: options.dryRun })
    console.log(JSON.stringify(result))
    return 0
  } catch (error) {
    console.error(error && error.code ? error.code : 'MIGRATION_FAILED')
    return 1
  } finally {
    await client.end().catch(() => {})
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code })

module.exports = { main, parseArgs }
