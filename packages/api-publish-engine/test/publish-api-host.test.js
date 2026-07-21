const assert = require('assert')
const test = require('node:test')
const { PublishApiServer } = require('../src/publish-api-server')

test('PublishApiServer 监听地址', async (t) => {
  await t.test('默认只绑定本机', async () => {
    const server = new PublishApiServer({ dryRun: true })
    await server.start(0)
    try { assert.strictEqual(server._server.address().address, '127.0.0.1') } finally { await server.stop() }
  })

  await t.test('容器部署可显式绑定所有 IPv4 接口', async () => {
    const server = new PublishApiServer({ dryRun: true, host: '0.0.0.0' })
    await server.start(0)
    try { assert.strictEqual(server._server.address().address, '0.0.0.0') } finally { await server.stop() }
  })
})
