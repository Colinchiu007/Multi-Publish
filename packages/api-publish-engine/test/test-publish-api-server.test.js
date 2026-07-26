'use strict'

const assert = require('assert').strict
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

const { TestPublishApiServer } = require('./test-publish-api-server')

test('测试服务器使用唯一临时 API Key 存储并在停止后清理', async () => {
  const first = new TestPublishApiServer({ dryRun: true })
  const second = new TestPublishApiServer({ dryRun: true })
  const firstKeysPath = first._keyManager._keysPath
  const secondKeysPath = second._keyManager._keysPath

  assert.notStrictEqual(firstKeysPath, secondKeysPath)
  assert.strictEqual(path.relative(os.tmpdir(), firstKeysPath).startsWith('..'), false)

  await Promise.all([first.start(0), second.start(0)])
  assert.strictEqual(fs.existsSync(path.dirname(firstKeysPath)), true)

  await first.stop()
  await second.stop()
  assert.strictEqual(fs.existsSync(path.dirname(firstKeysPath)), false)
  assert.strictEqual(fs.existsSync(path.dirname(secondKeysPath)), false)
})

test('显式 keysPath 仍由调用方管理', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-explicit-keys-'))
  const keysPath = path.join(root, 'api-keys.json')
  const server = new TestPublishApiServer({ dryRun: true, keysPath })

  try {
    await server.start(0)
    assert.strictEqual(server._keyManager._keysPath, keysPath)
  } finally {
    await server.stop()
  }

  assert.strictEqual(fs.existsSync(root), true)
  fs.rmSync(root, { recursive: true, force: true })
})
