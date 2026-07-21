'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createHarness } = require('./harness')

test('异步用例按注册顺序串行执行', async () => {
  const events = []
  const harness = createHarness({ successMark: 'OK', failureMark: 'FAIL' })
  harness.test('first', async () => {
    events.push('first:start')
    await Promise.resolve()
    events.push('first:end')
  })
  harness.test('second', async () => {
    events.push('second')
  })

  const result = await harness.run()
  assert.deepEqual(events, ['first:start', 'first:end', 'second'])
  assert.deepEqual(result, { passed: 2, failed: 0 })
})

test('失败用例不会阻止后续用例并设置退出码', async () => {
  const originalExitCode = process.exitCode
  const events = []
  const harness = createHarness({ successMark: 'OK', failureMark: 'FAIL' })
  harness.test('failed', async () => { throw new Error('expected failure') })
  harness.test('after', async () => { events.push('after') })

  const result = await harness.run()
  assert.deepEqual(result, { passed: 1, failed: 1 })
  assert.deepEqual(events, ['after'])
  assert.equal(process.exitCode, 1)
  process.exitCode = originalExitCode
})
