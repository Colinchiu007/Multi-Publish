const assert = require('assert')
const http = require('http')
const { PublishApiServer } = require('../src/publish-api-server')

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function main() {
  const consumed = []
  const entitlementProvider = {
    async requireFeature() { return true },
    async consumeFeature(context, amount) {
      consumed.push({ feature: context.feature, amount, subject: context.auth.subject })
      if (consumed.length > 1) {
        throw Object.assign(new Error('ENTITLEMENT_QUOTA_EXHAUSTED'), {
          code: 'ENTITLEMENT_QUOTA_EXHAUSTED', status: 429,
        })
      }
      return { used: amount, remaining: 0 }
    },
  }
  const server = new PublishApiServer({
    dryRun: true,
    enableSchedule: true,
    scheduleCheckInterval: 60_000,
    logtoVerifier: { verify: async () => ({ subject: 'sub-1', scopes: ['publish:submit', 'publish:read'] }) },
    businessIdentityRepository: {
      findBySubject: async () => ({ id: 'user-1', auth_subject: 'sub-1', status: 'active' }),
      create: async (record) => record,
    },
    entitlementProvider,
  })
  await server.start(0)
  const port = server._server.address().port
  try {
    const first = await request(port, 'POST', '/api/v1/publish', { platform: 'zhihu', title: 'first' })
    assert.strictEqual(first.status, 200)
    assert.deepStrictEqual(consumed, [{ feature: 'cloud_publish', amount: 1, subject: 'sub-1' }])

    const exhausted = await request(port, 'POST', '/api/v1/publish', { platform: 'zhihu', title: 'second' })
    assert.strictEqual(exhausted.status, 429)
    assert.strictEqual(exhausted.body.error, 'ENTITLEMENT_QUOTA_EXHAUSTED')

    consumed.length = 0
    const scheduled = await request(port, 'POST', '/api/v1/schedule', {
      platforms: ['zhihu', 'douyin'], title: 'later', scheduledAt: '2099-01-01T00:00:00.000Z',
    })
    assert.strictEqual(scheduled.status, 200)
    assert.deepStrictEqual(consumed, [], '创建排期时不能提前扣减额度')

    const entry = server._scheduler.get(scheduled.body.entry.id)
    await server._scheduler._execute(entry)
    assert.deepStrictEqual(consumed, [{ feature: 'cloud_publish', amount: 2, subject: 'sub-1' }])
  } finally {
    await server.stop()
  }

  console.log('  ✅ 发布额度在实际执行路径原子扣减')
}

main().catch((error) => {
  console.error(`  ❌ quota enforcement: ${error.stack || error.message}`)
  process.exitCode = 1
})
