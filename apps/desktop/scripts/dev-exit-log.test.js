// @ts-check
/**
 * dev-exit-log.test.js — 退出原因日志模块回归（node --test）
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { defaultExitLogFile, formatExitEntry, appendDevExitLog } = require('./dev-exit-log')

test('defaultExitLogFile 落在系统临时目录的固定文件名', () => {
  const f = defaultExitLogFile()
  assert.ok(f.startsWith(os.tmpdir()))
  assert.ok(f.endsWith('mp-start-dev.exit.log'))
})

test('formatExitEntry 包含事件/pid/code/signal/extra 与 ISO 时间', () => {
  const line = formatExitEntry({ event: 'vite-exit', pid: 123, exitCode: 1, signal: null, extra: 'userData=X' })
  assert.match(line, /^2026-\d{2}-\d{2}T/)
  assert.ok(line.includes('vite-exit'))
  assert.ok(line.includes('pid=123'))
  assert.ok(line.includes('code=1'))
  assert.ok(line.includes('extra=userData=X'))
  assert.ok(line.endsWith(os.EOL))
})

test('formatExitEntry 空字段不输出占位', () => {
  const line = formatExitEntry({ event: 'stop', exitCode: 0 })
  assert.ok(!line.includes('pid='))
  assert.ok(!line.includes('signal='))
  assert.ok(line.includes('code=0'))
})

test('appendDevExitLog 追加两行并保持顺序', (t) => {
  const file = path.join(os.tmpdir(), `dev-exit-log-test-${process.pid}-${Date.now()}.log`)
  t.after(() => fs.rmSync(file, { force: true }))
  appendDevExitLog({ event: 'first', pid: 1 }, file)
  appendDevExitLog({ event: 'second', exitCode: 2 }, file)
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.trim().split(os.EOL)
  assert.equal(lines.length, 2)
  assert.ok(lines[0].includes('first'))
  assert.ok(lines[1].includes('second'))
})

test('appendDevExitLog 写入失败静默返回 false（不抛）', () => {
  const bad = path.join(os.tmpdir(), 'this-is-a-directory-path-for-test')
  fs.mkdirSync(bad, { recursive: true })
  try {
    const ok = appendDevExitLog({ event: 'x' }, bad)
    assert.equal(ok, false)
  } finally {
    fs.rmSync(bad, { recursive: true, force: true })
  }
})
