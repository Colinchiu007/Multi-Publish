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
  // pnpm-lock.yaml 为唯一锁文件（2026-08-13 由 package-lock.json 迁移）
  const lockfile = fs.readFileSync(path.resolve(__dirname, '../../..', 'pnpm-lock.yaml'), 'utf8')
  const axiosMatches = [...lockfile.matchAll(/axios@(\d+\.\d+\.\d+)/g)].map((m) => m[1])

  assert(isAtLeast(apiPackage.dependencies.axios, '1.18.1'))
  assert(axiosMatches.length > 0, 'pnpm-lock.yaml 未找到 axios 条目')
  // 断言锁文件中所有 axios 版本均 ≥ 1.18.1，避免首个字典序匹配掩盖低危版本
  for (const version of axiosMatches) {
    assert(isAtLeast(version, '1.18.1'), `pnpm-lock.yaml 存在低危 axios 版本 ${version}`)
  }
})
