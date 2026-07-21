#!/usr/bin/env node
const { validateProductionConfig } = require('../src/auth/production-config')

function parseArgs(argv = process.argv.slice(2)) {
  const result = { phase: 'shadow' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--phase' && argv[index + 1]) result.phase = argv[++index]
    else if (argv[index] === '--help' || argv[index] === '-h') result.help = true
  }
  return result
}

function main(options = parseArgs(), env = process.env) {
  if (options.help) {
    console.log('用法: validate-production-config [--phase shadow|required|rollback]')
    return 0
  }
  const result = validateProductionConfig(env, { phase: options.phase })
  console.log(JSON.stringify(result))
  return result.valid ? 0 : 1
}

if (require.main === module) process.exitCode = main()

module.exports = { main, parseArgs }
