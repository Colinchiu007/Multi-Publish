#!/usr/bin/env node
const fs = require('fs')
const { validateProductionConfig } = require('../../../packages/api-publish-engine/src/auth/production-config')

function readEnvFile(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return env
}

function main(options = {}) {
  const file = options.file || process.env.API_ENV_FILE
  if (!file) { console.error('API_ENV_FILE_REQUIRED'); return 2 }
  try {
    const result = validateProductionConfig(readEnvFile(file), { phase: options.phase || 'shadow' })
    console.log(JSON.stringify({ valid: result.valid, phase: result.phase, errors: result.errors, warnings: result.warnings }))
    return result.valid ? 0 : 1
  } catch {
    console.error('ROLLOUT_CONFIG_READ_FAILED')
    return 1
  }
}

if (require.main === module) {
  const phaseIndex = process.argv.indexOf('--phase')
  const fileIndex = process.argv.indexOf('--file')
  process.exitCode = main({
    phase: phaseIndex >= 0 ? process.argv[phaseIndex + 1] : 'shadow',
    file: fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined,
  })
}

module.exports = { main, readEnvFile }
