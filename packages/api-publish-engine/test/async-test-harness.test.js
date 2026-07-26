'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createHarness } = require('./async-test-harness')

test('零用例测试集合必须 fail closed', async () => {
  const originalExitCode = process.exitCode
  process.exitCode = undefined

  try {
    const result = await createHarness().run()

    assert.deepEqual(result, { passed: 0, failed: 1 })
    assert.equal(process.exitCode, 1)
  } finally {
    process.exitCode = originalExitCode
  }
})
