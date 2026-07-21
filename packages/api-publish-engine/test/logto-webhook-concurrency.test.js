const assert = require('assert')
const crypto = require('crypto')
const test = require('node:test')

function sign(payload, key) { return crypto.createHmac('sha256', key).update(payload).digest('hex') }

test('Logto Webhook 并发幂等', async () => {
  const { LogtoWebhookConsumer } = require('../src/auth/logto-webhook')
  const events = new Set()
  let sideEffects = 0
  const repository = {
    async transaction(callback) {
      const transaction = {
        async claimWebhookEvent(record) {
          if (events.has(record.id)) return false
          events.add(record.id)
          return true
        },
        async upsertUserState() { sideEffects += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { applied: true } },
        async revokeUserSessions() {},
        async completeWebhookEvent() {},
      }
      return callback(transaction)
    },
  }
  const consumer = new LogtoWebhookConsumer({ signingKey: 'w'.repeat(32), repository, now: () => new Date('2026-07-21T00:00:00.000Z') })
  const rawBody = JSON.stringify({
    event: 'User.Created', hookId: 'hook-1', createdAt: '2026-07-21T00:00:00.000Z', data: { id: 'sub-1' },
  })
  const [first, second] = await Promise.all([
    consumer.consume({ rawBody, signature: sign(rawBody, 'w'.repeat(32)) }),
    consumer.consume({ rawBody, signature: sign(rawBody, 'w'.repeat(32)) }),
  ])

  assert.strictEqual(sideEffects, 1)
  assert.strictEqual([first, second].filter((result) => result.duplicate === true).length, 1)
})
