const assert = require('assert')
const crypto = require('crypto')

function sign(payload, key) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex')
}

function createRepository() {
  const processedEvents = new Map()
  const users = new Map()
  const revoked = []
  let failNextUpdate = false

  return {
    processedEvents,
    users,
    revoked,
    failNextUpdate() { failNextUpdate = true },
    async transaction(callback) {
      const stagedEvents = new Map(processedEvents)
      const stagedUsers = new Map(users)
      const stagedRevoked = revoked.slice()
      const tx = {
        async claimWebhookEvent(record) {
          if (stagedEvents.has(record.id)) return false
          stagedEvents.set(record.id, { ...record, status: 'processing' })
          return true
        },
        async upsertUserState(provider, subject, patch, options = {}) {
          if (failNextUpdate) {
            failNextUpdate = false
            throw new Error('数据库暂时不可用')
          }
          const key = `${provider}:${subject}`
          const current = stagedUsers.get(key) || { auth_provider: provider, auth_subject: subject }
          if (current.event_created_at && current.event_created_at >= options.eventCreatedAt) {
            return { ...current, applied: false }
          }
          const orderedPatch = { ...patch }
          if (options.preserveDeleted && current.status === 'deleted') delete orderedPatch.status
          const next = { ...current, ...orderedPatch, event_created_at: options.eventCreatedAt }
          stagedUsers.set(key, next)
          return { ...next, applied: true }
        },
        async revokeUserSessions(provider, subject, reason) {
          stagedRevoked.push({ provider, subject, reason })
        },
        async completeWebhookEvent(eventId, result) {
          stagedEvents.set(eventId, { ...stagedEvents.get(eventId), status: 'processed', result })
        },
      }
      const result = await callback(tx)
      processedEvents.clear()
      stagedEvents.forEach((value, key) => processedEvents.set(key, value))
      users.clear()
      stagedUsers.forEach((value, key) => users.set(key, value))
      revoked.splice(0, revoked.length, ...stagedRevoked)
      return result
    },
  }
}

async function main() {
  const {
    LogtoWebhookConsumer,
    LogtoWebhookError,
    deriveLogtoWebhookEventId,
  } = require('../src/auth/logto-webhook')
  assert.strictEqual(require('../src').LogtoWebhookConsumer, LogtoWebhookConsumer)

  const signingKey = 'test-signing-key'
  const repository = createRepository()
  const consumer = new LogtoWebhookConsumer({
    signingKey,
    repository,
    maxBodyBytes: 1024,
    now: () => new Date('2026-07-20T00:10:00.000Z'),
  })

  const suspendedPayload = {
    event: 'User.SuspensionStatus.Updated',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:00:00.000Z',
    data: { id: 'user-1', isSuspended: true, name: '测试用户' },
  }
  const suspendedRaw = JSON.stringify(suspendedPayload)
  const suspended = await consumer.consume({
    rawBody: suspendedRaw,
    signature: sign(suspendedRaw, signingKey),
  })
  assert.deepStrictEqual(suspended, {
    accepted: true,
    duplicate: false,
    eventId: deriveLogtoWebhookEventId(suspendedPayload, suspendedRaw),
    event: 'User.SuspensionStatus.Updated',
  })
  assert.strictEqual(repository.users.get('logto:user-1').status, 'suspended')
  assert.deepStrictEqual(repository.revoked, [{ provider: 'logto', subject: 'user-1', reason: 'user_suspended' }])

  const duplicate = await consumer.consume({
    rawBody: suspendedRaw,
    signature: sign(suspendedRaw, signingKey),
  })
  assert.strictEqual(duplicate.duplicate, true)
  assert.strictEqual(repository.revoked.length, 1)

  const restoredPayload = {
    ...suspendedPayload,
    createdAt: '2026-07-20T00:01:00.000Z',
    data: { id: 'user-1', isSuspended: false },
  }
  const restoredRaw = JSON.stringify(restoredPayload)
  await consumer.consume({ rawBody: restoredRaw, signature: sign(restoredRaw, signingKey) })
  assert.strictEqual(repository.users.get('logto:user-1').status, 'active')
  assert.strictEqual(repository.revoked.length, 1)

  const deletedPayload = {
    event: 'User.Deleted',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:02:00.000Z',
    eventId: 'delivery-delete-1',
    data: { id: 'user-1' },
  }
  const deletedRaw = JSON.stringify(deletedPayload)
  const deleted = await consumer.consume({ rawBody: deletedRaw, signature: sign(deletedRaw, signingKey) })
  assert.strictEqual(deleted.eventId, 'delivery-delete-1')
  assert.strictEqual(repository.users.get('logto:user-1').status, 'deleted')
  assert.deepStrictEqual(repository.revoked[1], { provider: 'logto', subject: 'user-1', reason: 'user_deleted' })

  const updatedPayload = {
    event: 'User.Data.Updated',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:03:00.000Z',
    data: { id: 'user-2', name: '新名称', avatar: 'https://example.com/avatar.png' },
  }
  const updatedRaw = JSON.stringify(updatedPayload)
  await consumer.consume({ rawBody: updatedRaw, signature: sign(updatedRaw, signingKey) })
  assert.strictEqual(repository.users.get('logto:user-2').display_name, '新名称')
  assert.strictEqual(repository.users.get('logto:user-2').avatar_url, 'https://example.com/avatar.png')

  const staleRestorePayload = {
    ...suspendedPayload,
    createdAt: '2026-07-19T23:59:00.000Z',
    data: { id: 'user-1', isSuspended: false },
  }
  const staleRestoreRaw = JSON.stringify(staleRestorePayload)
  await consumer.consume({ rawBody: staleRestoreRaw, signature: sign(staleRestoreRaw, signingKey) })
  assert.strictEqual(repository.users.get('logto:user-1').status, 'deleted')

  const staleDeletePayload = {
    event: 'User.Deleted',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:02:30.000Z',
    eventId: 'delivery-stale-delete',
    data: { id: 'user-2' },
  }
  const staleDeleteRaw = JSON.stringify(staleDeletePayload)
  const revokedBeforeStaleDelete = repository.revoked.length
  const staleDelete = await consumer.consume({
    rawBody: staleDeleteRaw,
    signature: sign(staleDeleteRaw, signingKey),
  })
  assert.strictEqual(staleDelete.ignored, true)
  assert.strictEqual(repository.users.get('logto:user-2').display_name, '新名称')
  assert.strictEqual(repository.users.get('logto:user-2').status, undefined)
  assert.strictEqual(repository.revoked.length, revokedBeforeStaleDelete)

  const invalidRaw = JSON.stringify({ ...updatedPayload, data: { id: 'attacker' } })
  await assert.rejects(
    consumer.consume({ rawBody: invalidRaw, signature: sign(updatedRaw, signingKey) }),
    (error) => error instanceof LogtoWebhookError && error.code === 'WEBHOOK_SIGNATURE_INVALID' && error.status === 401
  )
  assert.strictEqual(repository.users.has('logto:attacker'), false)

  const unsupportedPayload = {
    event: 'Role.Deleted',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:04:00.000Z',
    data: { id: 'role-1' },
  }
  const unsupportedRaw = JSON.stringify(unsupportedPayload)
  await assert.rejects(
    consumer.consume({ rawBody: unsupportedRaw, signature: sign(unsupportedRaw, signingKey) }),
    (error) => error.code === 'WEBHOOK_EVENT_UNSUPPORTED' && error.status === 422
  )

  await assert.rejects(
    consumer.consume({ rawBody: 'x'.repeat(1025), signature: '0'.repeat(64) }),
    (error) => error.code === 'WEBHOOK_BODY_TOO_LARGE' && error.status === 413
  )

  for (const [createdAt, code] of [
    ['2026-07-19T23:00:00.000Z', 'WEBHOOK_EVENT_STALE'],
    ['2026-07-20T00:20:00.000Z', 'WEBHOOK_EVENT_FUTURE'],
  ]) {
    const payload = {
      event: 'User.Created',
      hookId: 'hook-1',
      createdAt,
      eventId: `invalid-time-${code}`,
      data: { id: `user-${code}` },
    }
    const raw = JSON.stringify(payload)
    await assert.rejects(
      consumer.consume({ rawBody: raw, signature: sign(raw, signingKey) }),
      (error) => error.code === code && error.status === 422
    )
    assert.strictEqual(repository.users.has(`logto:user-${code}`), false)
  }

  let staleClaimCalls = 0
  const freshnessRepository = {
    async transaction(callback) {
      return callback({
        async claimWebhookEvent() {
          staleClaimCalls += 1
          return true
        },
      })
    },
  }
  const freshnessConsumer = new LogtoWebhookConsumer({
    signingKey,
    repository: freshnessRepository,
    now: () => new Date('2026-07-20T00:10:00.000Z'),
  })
  const staleBeforeClaimPayload = {
    event: 'User.Created',
    hookId: 'hook-1',
    createdAt: '2026-07-19T23:00:00.000Z',
    eventId: 'stale-before-claim',
    data: { id: 'user-stale-before-claim' },
  }
  const staleBeforeClaimRaw = JSON.stringify(staleBeforeClaimPayload)
  await assert.rejects(
    freshnessConsumer.consume({
      rawBody: staleBeforeClaimRaw,
      signature: sign(staleBeforeClaimRaw, signingKey),
    }),
    (error) => error.code === 'WEBHOOK_EVENT_STALE'
  )
  assert.strictEqual(staleClaimCalls, 0)

  const retryPayload = {
    event: 'User.SuspensionStatus.Updated',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:05:00.000Z',
    data: { id: 'user-retry', isSuspended: true },
  }
  const retryRaw = JSON.stringify(retryPayload)
  const retryId = deriveLogtoWebhookEventId(retryPayload, retryRaw)
  repository.failNextUpdate()
  await assert.rejects(
    consumer.consume({ rawBody: retryRaw, signature: sign(retryRaw, signingKey) }),
    /数据库暂时不可用/
  )
  assert.strictEqual(repository.processedEvents.has(retryId), false)
  const retryResult = await consumer.consume({ rawBody: retryRaw, signature: sign(retryRaw, signingKey) })
  assert.strictEqual(retryResult.duplicate, false)
  assert.strictEqual(repository.users.get('logto:user-retry').status, 'suspended')

  const testPayload = {
    event: 'User.Data.Updated',
    hookId: 'hook-1',
    createdAt: '2026-07-20T00:06:00.000Z',
    path: '/fake-path/:id',
    params: { id: 'fake-id' },
    data: { result: 'success' },
  }
  const testRaw = JSON.stringify(testPayload)
  const testResult = await consumer.consume({ rawBody: testRaw, signature: sign(testRaw, signingKey) })
  assert.strictEqual(testResult.ignored, true)
  assert.strictEqual(repository.users.has('logto:fake-id'), false)

  console.log('  ✅ Logto webhook 验签、幂等、暂停和删除处理')
}

main().catch((error) => {
  console.error(`  ❌ Logto webhook: ${error.stack || error.message}`)
  process.exitCode = 1
})
