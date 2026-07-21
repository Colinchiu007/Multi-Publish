const assert = require('assert')
const http = require('http')
const test = require('node:test')
const { PublishApiServer } = require('../src/publish-api-server')

function request(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method: 'POST', path: '/api/v1/publish',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    }, (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }))
    })
    req.on('error', reject)
    req.end(JSON.stringify({ platform: 'zhihu', title: 'concurrent' }))
  })
}

test('额度并发扣减', async () => {
  let remaining = 1
  const server = new PublishApiServer({
    dryRun: true,
    logtoVerifier: { verify: async () => ({ subject: 'sub-1', scopes: ['publish:submit'] }) },
    businessIdentityRepository: {
      findBySubject: async () => ({ id: 'user-1', auth_subject: 'sub-1', status: 'active' }),
      create: async (record) => record,
    },
    entitlementProvider: {
      requireFeature: async () => true,
      consumeFeature: async () => {
        if (remaining <= 0) throw Object.assign(new Error('quota'), { code: 'ENTITLEMENT_QUOTA_EXHAUSTED', status: 429 })
        remaining -= 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { used: 1, remaining: 0 }
      },
    },
  })
  const port = await server.start(0)
  try {
    const results = await Promise.all([request(port), request(port)])
    assert.strictEqual(results.filter((result) => result.status === 200).length, 1)
    assert.strictEqual(results.filter((result) => result.status === 429).length, 1)
  } finally {
    await server.stop()
  }
})
