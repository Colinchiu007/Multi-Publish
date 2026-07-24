const assert = require('assert')
const fs = require('fs')
const path = require('path')
const test = require('node:test')

function parseVersion(value) {
  const match = /^(?:\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim())
  assert(match, `无法解析稳定版本：${value}`)
  return match.slice(1).map(Number)
}

function isAtLeast(actual, minimum) {
  const current = parseVersion(actual)
  const expected = parseVersion(minimum)
  for (let index = 0; index < expected.length; index += 1) {
    if (current[index] > expected[index]) return true
    if (current[index] < expected[index]) return false
  }
  return true
}

test('生产依赖不允许解析到存在高危公告的 Axios 版本', () => {
  const apiPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'))
  const lockfile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', 'package-lock.json'), 'utf8'))

  assert(isAtLeast(apiPackage.dependencies.axios, '1.18.0'))
  assert(isAtLeast(lockfile.packages['node_modules/axios'].version, '1.18.0'))
})
