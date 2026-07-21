const assert = require('assert')
const crypto = require('crypto')
const http = require('http')
const { PublishApiServer } = require('../src/publish-api-server')
const { LogtoWebhookConsumer } = require('../src/auth/logto-webhook')

function request(port, rawBody, signature) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/v1/auth/logto/webhook',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
        'logto-signature-sha-256': signature,
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    req.write(rawBody)
    req.end()
  })
}

function createRepository() {
  const eventIds = new Set()
  const users = new Map()
  return {
    users,
    async transaction(callback) {
      const nextEvents = new Set(eventIds)
      const nextUsers = new Map(users)
      const result = await callback({
        claimWebhookEvent: async ({ id }) => {
          if (nextEvents.has(id)) return false
          nextEvents.add(id)
          return true
        },
        upsertUserState: async (provider, subject, patch) => {
          nextUsers.set(`${provider}:${subject}`, { ...(nextUsers.get(`${provider}:${subject}`) || {}), ...patch })
        },
        revokeUserSessions: async () => {},
        completeWebhookEvent: async () => {},
      })
      eventIds.clear()
      nextEvents.forEach((id) => eventIds.add(id))
      users.clear()
      nextUsers.forEach((value, key) => users.set(key, value))
      return result
    },
  }
}

async function main() {
  const key = 'server-signing-key'
  const repository = createRepository()
  const consumer = new LogtoWebhookConsumer({
    signingKey: key,
    repository,
    maxBodyBytes: 512,
    now: () => new Date('2026-07-20T01:01:00.000Z'),
  })
  const verifier = { verify: async () => { throw new Error('webhook 不应走 Bearer 鉴权') } }
  const server = new PublishApiServer({ dryRun: true, logtoVerifier: verifier, logtoWebhookConsumer: consumer })
  await server.start(0)
  const port = server._server.address().port
  try {
    const payload = {
      event: 'User.Deleted',
      hookId: 'hook-server',
      createdAt: '2026-07-20T01:00:00.000Z',
      data: { id: 'server-user' },
    }
    const rawBody = JSON.stringify(payload)
    const signature = crypto.createHmac('sha256', key).update(rawBody).digest('hex')
    const accepted = await request(port, rawBody, signature)
    assert.strictEqual(accepted.status, 200)
    assert.strictEqual(accepted.body.success, true)
    assert.strictEqual(repository.users.get('logto:server-user').status, 'deleted')

    const rejected = await request(port, rawBody, '0'.repeat(64))
    assert.strictEqual(rejected.status, 401)
    assert.strictEqual(rejected.body.error, 'WEBHOOK_SIGNATURE_INVALID')

    const oversized = 'x'.repeat(513)
    const tooLarge = await request(port, oversized, '0'.repeat(64))
    assert.strictEqual(tooLarge.status, 413)
    assert.strictEqual(tooLarge.body.error, 'WEBHOOK_BODY_TOO_LARGE')
    console.log('  ✅ PublishApiServer Logto webhook 原始请求体验签与限长')
  } finally {
    await server.stop()
  }
}

main().catch((error) => {
  console.error(`  ❌ PublishApiServer Logto webhook: ${error.stack || error.message}`)
  process.exitCode = 1
})
