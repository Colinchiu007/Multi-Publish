'use strict'

// TDD：先锁住三个已被实证踩到的缺陷，再改实现。
// 1) 同目录下的 *.test.js 假数据（私钥串、sk-xxx、假 token）被当成真实高危 → 高危档全是噪音
// 2) 传单个文件时 walkDir 读目录失败返回 [] → files_scanned=0 却 passed=true（假绿灯）
// 3) 噪音剔除后必须仍能报出真问题（防「把测试文件排除」变成「把扫描器关掉」）

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')

const scanner = require('./security_scanner')
const { scanDirectory, DEFAULT_EXCLUDES, isTestFile } = scanner

function mkTmpDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccg-scan-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
  }
  return dir
}

function findFile(result, needle) {
  return result.findings.find((f) => f.file_path.includes(needle))
}

// ---- 缺陷 1：测试文件假数据造成高危噪音 ----

test('同目录下的 *.test.js 不应产生高危发现（假私钥 / 假 key / 假 token）', () => {
  const dir = mkTmpDir({
    'fixture.test.js': [
      "const k = '-----BEGIN PRIVATE KEY-----';",
      "const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';",
      "const url = 'https://example.com/api?token=SECRET123';",
    ].join('\n'),
  })
  const r = scanDirectory(dir, DEFAULT_EXCLUDES)
  assert.strictEqual(r.files_scanned, 0,
    `测试文件应被排除在扫描范围外，实际扫了 ${r.files_scanned} 个文件：${JSON.stringify(r.findings)}`)
  assert.strictEqual(r.passed, true)
  assert.strictEqual(r.findings.length, 0, `不应有任何发现：${JSON.stringify(r.findings, null, 2)}`)
})

test('*.spec.* / *.e2e.* / __tests__ 下的文件同样排除', () => {
  for (const name of ['a.spec.js', 'a.e2e.js', '__tests__/a.js', 'test/a.js', 'tests/a.js']) {
    const dir = mkTmpDir({ [name]: "const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';" })
    const r = scanDirectory(dir, DEFAULT_EXCLUDES)
    assert.strictEqual(r.findings.length, 0, `${name} 应被排除，实际：${JSON.stringify(r.findings)}`)
  }
})

test('生产代码里同名形态仍必须报出（防「排测试」被写成「全不扫」）', () => {
  const dir = mkTmpDir({
    'app.js': "const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';",
  })
  const r = scanDirectory(dir, DEFAULT_EXCLUDES)
  assert.strictEqual(r.files_scanned, 1, '生产文件必须仍在扫描范围内')
  assert.ok(findFile(r, 'app.js'), `生产文件的硬编码必须报出：${JSON.stringify(r.findings)}`)
})

// ---- 缺陷 2：传单文件 -> files_scanned=0 却 passed=true（假绿灯） ----

test('传入单个文件时必须真的扫描它，而不是静默 0 文件通过', () => {
  const dir = mkTmpDir({ 'single.js': "const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';" })
  const file = path.join(dir, 'single.js')
  const r = scanDirectory(file, DEFAULT_EXCLUDES)
  assert.strictEqual(r.files_scanned, 1, `单文件扫描必须计入 files_scanned，实际 ${r.files_scanned}`)
  assert.strictEqual(r.passed, false, '单文件里有高危时不得报 passed')
  assert.ok(findFile(r, 'single.js'), `单文件扫描必须报出发现：${JSON.stringify(r.findings)}`)
})

test('单文件无高危时 files_scanned=1 且 passed=true', () => {
  const dir = mkTmpDir({ 'clean.js': 'module.exports = 1\n' })
  const r = scanDirectory(path.join(dir, 'clean.js'), DEFAULT_EXCLUDES)
  assert.strictEqual(r.files_scanned, 1)
  assert.strictEqual(r.passed, true)
})

test('传入单个测试文件时明确 fail-closed（不得静默变成 0 文件绿灯）', () => {
  const dir = mkTmpDir({ 'x.test.js': "const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';" })
  const r = scanDirectory(path.join(dir, 'x.test.js'), DEFAULT_EXCLUDES)
  // 要么明确排除并报错，要么明确扫描并放过；绝不能「扫了 0 个还通过」
  assert.notStrictEqual(
    r.files_scanned === 0 && r.passed === true, true,
    '对测试文件必须显式处置，禁止静默 0 文件绿灯')
})

// ---- isTestFile 判定本身的边界 ----

test('isTestFile 只认测试形态，不得误伤正常文件名', () => {
  for (const n of ['app.js', 'rpa-view-platforms.js', 'latest.js', 'contest.js', 'testimonial.js']) {
    assert.strictEqual(isTestFile(n), false, `${n} 不应被判为测试文件`)
  }
  for (const n of ['app.test.js', 'app.spec.js', 'app.e2e.js', 'app.test.tsx', 'test_helper.js']) {
    assert.strictEqual(isTestFile(n), true, `${n} 应被判为测试文件`)
  }
})