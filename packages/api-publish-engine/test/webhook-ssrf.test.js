const assert = require('assert')
const { WebhookManager } = require('../src/webhook-manager')

function fakeRequest(calls) {
  return (options) => {
    calls.push(options)
    return {
      on() { return this },
      setTimeout() { return this },
      write() {},
      end() {},
      destroy() {},
    }
  }
}

async function main() {
  for (const url of [
    'http://2130706433/hook',
    'http://100.64.0.1/hook',
    'http://[::1]/hook',
    'http://[::ffff:127.0.0.1]/hook',
    'http://[fc00::1]/hook',
    'http://[fe80::1]/hook',
  ]) {
    await assert.rejects(
      new WebhookManager().register({ url }),
      /internal\/private network/,
      `必须拒绝非公网地址：${url}`,
    )
  }

  const blockedCalls = []
  const blocked = new WebhookManager({
    lookup: async () => [{ address: '10.0.0.9', family: 4 }],
    httpRequest: fakeRequest(blockedCalls),
  })
  await blocked.register({ url: 'http://internal.example/hook' })
  await blocked.fire('publish.completed', { id: 'task-1' })
  assert.strictEqual(blockedCalls.length, 0, '域名解析到私网时不得建立请求')

  const mixedCalls = []
  const mixed = new WebhookManager({
    lookup: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
    httpRequest: fakeRequest(mixedCalls),
  })
  await mixed.register({ url: 'http://mixed.example/hook' })
  await mixed.fire('publish.completed', { id: 'task-1' })
  assert.strictEqual(mixedCalls.length, 0, '解析结果混入私网地址时必须整体拒绝')

  const publicCalls = []
  const publicAddress = '93.184.216.34'
  const allowed = new WebhookManager({
    lookup: async () => [{ address: publicAddress, family: 4 }],
    httpRequest: fakeRequest(publicCalls),
  })
  await allowed.register({ url: 'http://public.example/hook' })
  await allowed.fire('publish.completed', { id: 'task-1' })
  assert.strictEqual(publicCalls.length, 1)
  assert.strictEqual(publicCalls[0].hostname, 'public.example')
  assert.strictEqual(publicCalls[0].family, 4)
  await new Promise((resolve, reject) => {
    publicCalls[0].lookup('public.example', {}, (error, address, family) => {
      if (error) return reject(error)
      try {
        assert.strictEqual(address, publicAddress)
        assert.strictEqual(family, 4)
        resolve()
      } catch (assertionError) {
        reject(assertionError)
      }
    })
  })

  console.log('  ✅ Webhook 发送拒绝非公网地址并固定 DNS 解析结果')
}

main().catch((error) => {
  console.error(`  ❌ Webhook SSRF: ${error.stack || error.message}`)
  process.exitCode = 1
})
