const assert = require('assert')
const crypto = require('crypto')
const http = require('http')
const test = require('node:test')

const { createLogtoJwtVerifier } = require('../src/auth/logto-jwks')
const { ensureBusinessUser } = require('../src/auth/business-identity')
const { PublishApiServer } = require('../src/publish-api-server')
const { ScheduledPublish } = require('../src/scheduled-publish')
const { WebhookManager } = require('../src/webhook-manager')

function signToken(privateKey, kid, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

function request(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

test('JWKS 允许同源回环 HTTP，但继续拒绝外部 HTTP', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const localIssuer = 'http://127.0.0.1:3001/oidc'
  const audience = 'https://api.multi-publish.com'
  const jwk = publicKey.export({ format: 'jwk' })
  const fetcher = async (url) => ({
    ok: true,
    json: async () => url.endsWith('/.well-known/openid-configuration')
      ? { issuer: localIssuer, jwks_uri: `${localIssuer}/jwks` }
      : { keys: [{ ...jwk, kid: 'local-key', alg: 'RS256', use: 'sig' }] },
  })
  const verifier = createLogtoJwtVerifier({ issuer: localIssuer, audience, fetcher, now: () => 150 })
  const token = signToken(privateKey, 'local-key', {
    sub: 'sub-local', iss: localIssuer, aud: audience, scope: 'publish:read', iat: 100, exp: 200,
  })

  assert.deepStrictEqual(await verifier.verify(token), { subject: 'sub-local', scopes: ['publish:read'] })

  const insecureIssuer = 'http://id.example.com/oidc'
  const insecureVerifier = createLogtoJwtVerifier({
    issuer: insecureIssuer,
    audience,
    fetcher: async () => ({
      ok: true,
      json: async () => ({ issuer: insecureIssuer, jwks_uri: `${insecureIssuer}/jwks` }),
    }),
  })
  await assert.rejects(insecureVerifier.verify(signToken(privateKey, 'local-key', {
    sub: 'sub-remote', iss: insecureIssuer, aud: audience, exp: Math.floor(Date.now() / 1000) + 60,
  })), (error) => error.code === 'AUTH_ISSUER_INVALID')
})

test('WebhookManager 按 ownerSubject 隔离列表、删除和事件投递', async () => {
  const manager = new WebhookManager()
  const sent = []
  manager._send = (url) => { sent.push(url) }
  const webhookA = await manager.register({ url: 'https://a.example.com/hook', ownerSubject: 'sub-a' })
  const webhookB = await manager.register({ url: 'https://b.example.com/hook', ownerSubject: 'sub-b' })

  assert.deepStrictEqual(manager.list('sub-a').map((item) => item.id), [webhookA.id])
  assert.deepStrictEqual(manager.list('sub-b').map((item) => item.id), [webhookB.id])
  assert.strictEqual(manager.remove(webhookB.id, 'sub-a'), false)
  assert.strictEqual(manager.remove(webhookB.id, 'sub-b'), true)

  await manager.fire('schedule.completed', { id: 'schedule-a' }, 'sub-a')
  assert.deepStrictEqual(sent, ['https://a.example.com/hook'])

  const legacyWebhook = await manager.register({ url: 'https://legacy.example.com/hook' })
  sent.length = 0
  await manager.fire('schedule.completed', { id: 'legacy-schedule' }, null)
  assert.deepStrictEqual(sent, [legacyWebhook.url], '无 owner 的旧任务不得广播给已认证租户')
})

test('并发创建返回非 active 用户时必须 fail closed', async () => {
  await assert.rejects(
    ensureBusinessUser({
      async findBySubject() { return null },
      async create(record) { return { ...record, status: 'deleted' } },
    }, { subject: 'sub-deleted' }),
    (error) => error && error.code === 'BUSINESS_USER_DELETED',
  )
  await assert.rejects(
    ensureBusinessUser({
      async findBySubject() { return null },
      async create() { return null },
    }, { subject: 'sub-missing' }),
    (error) => error && error.code === 'BUSINESS_USER_UNAVAILABLE',
  )
})

test('PublishApiServer 隔离 Webhook，并要求管理员 scope 撤销 API Key', async () => {
  const verifier = {
    async verify(token) {
      const subject = token === 'token-a' ? 'sub-a' : token === 'token-b' ? 'sub-b' : 'sub-unknown'
      return { subject, scopes: ['publish:read', 'publish:submit'] }
    },
  }
  const repository = {
    async findBySubject(provider, subject) {
      return { id: `business-${subject}`, auth_provider: provider, auth_subject: subject, status: 'active' }
    },
    async create(record) { return record },
  }
  const server = new PublishApiServer({
    dryRun: true,
    logtoVerifier: verifier,
    businessIdentityRepository: repository,
    entitlementProvider: { async getForUser() { return { plan: 'pro', features: ['cloud_publish'] } } },
  })
  await server.start(0)
  const port = server._server.address().port

  try {
    const createdA = await request(port, 'POST', '/api/v1/webhook', 'token-a', { url: 'https://a.example.com/hook' })
    const createdB = await request(port, 'POST', '/api/v1/webhook', 'token-b', { url: 'https://b.example.com/hook' })
    assert.deepStrictEqual([createdA.status, createdB.status], [200, 200])

    const listA = await request(port, 'GET', '/api/v1/webhook', 'token-a')
    const listB = await request(port, 'GET', '/api/v1/webhook', 'token-b')
    assert.deepStrictEqual(listA.body.webhooks.map((item) => item.url), ['https://a.example.com/hook'])
    assert.deepStrictEqual(listB.body.webhooks.map((item) => item.url), ['https://b.example.com/hook'])
    assert(listA.body.webhooks.every((item) => !Object.prototype.hasOwnProperty.call(item, 'ownerSubject')))

    const crossDelete = await request(port, 'POST', '/api/v1/webhook/remove', 'token-a', { id: createdB.body.webhook.id })
    assert.strictEqual(crossDelete.status, 404)

    const keyRevoke = await request(port, 'POST', '/api/v1/keys/revoke', 'token-a', { key: 'mp_not-owned' })
    assert.strictEqual(keyRevoke.status, 403)
    assert.strictEqual(keyRevoke.body.message, 'AUTH_SCOPE_MISSING')
  } finally {
    await server.stop()
  }
})

test('可选 Logto 模式下旧 API Key 只能访问 legacy 资源', async () => {
  const verifier = {
    async verify(token) {
      if (token === 'logto-token') return { subject: 'sub-logto', scopes: ['publish:read', 'publish:submit'] }
      throw Object.assign(new Error('not a jwt'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
    },
  }
  const repository = {
    async findBySubject(provider, subject) {
      return { id: `business-${subject}`, auth_provider: provider, auth_subject: subject, status: 'active' }
    },
    async create(record) { return record },
  }
  const server = new PublishApiServer({
    dryRun: true,
    apiKey: 'legacy-key',
    autoMigrate: false,
    identityAuthRequired: false,
    logtoVerifier: verifier,
    businessIdentityRepository: repository,
    entitlementProvider: { async getForUser() { return { plan: 'pro', features: ['cloud_publish'] } } },
  })
  await server.start(0)
  const port = server._server.address().port

  try {
    const created = await request(port, 'POST', '/api/v1/webhook', 'logto-token', { url: 'https://owned.example.com/hook' })
    assert.strictEqual(created.status, 200)

    const legacyCreated = await request(port, 'POST', '/api/v1/webhook', 'legacy-key', { url: 'https://legacy.example.com/hook' })
    assert.strictEqual(legacyCreated.status, 200)

    const legacyList = await request(port, 'GET', '/api/v1/webhook', 'legacy-key')
    assert.deepStrictEqual(legacyList.body.webhooks.map((item) => item.url), ['https://legacy.example.com/hook'])

    const legacyRemove = await request(port, 'POST', '/api/v1/webhook/remove', 'legacy-key', { id: created.body.webhook.id })
    assert.strictEqual(legacyRemove.status, 404)
    assert.strictEqual((await request(port, 'POST', '/api/v1/webhook/remove', 'legacy-key', { id: legacyCreated.body.webhook.id })).status, 200)
  } finally {
    await server.stop()
  }
})

test('定时发布执行前重新校验用户状态和 cloud_publish 权益', async () => {
  let authorizationChecks = 0
  const scheduler = new ScheduledPublish({
    authorizeEntry: async (entry) => {
      authorizationChecks += 1
      assert.strictEqual(entry.ownerSubject, 'sub-suspended')
      throw Object.assign(new Error('BUSINESS_USER_SUSPENDED'), { code: 'BUSINESS_USER_SUSPENDED' })
    },
  })
  const entry = await scheduler.schedule({
    ownerSubject: 'sub-suspended',
    platforms: ['zhihu'],
    title: '不得发布',
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
  })

  await scheduler._execute(entry)
  assert.strictEqual(authorizationChecks, 1)
  assert.strictEqual(entry.status, 'failed')
  assert.strictEqual(entry.error, 'BUSINESS_USER_SUSPENDED')
})

test('PublishApiServer 将业务用户和权益校验接入定时执行器', async () => {
  let entitlementChecks = 0
  const server = new PublishApiServer({
    dryRun: true,
    enableSchedule: true,
    logtoVerifier: { async verify() { return { subject: 'sub-suspended', scopes: [] } } },
    businessIdentityRepository: {
      async findBySubject() {
        return { id: 'business-suspended', auth_subject: 'sub-suspended', status: 'suspended' }
      },
    },
    entitlementProvider: {
      async requireFeature() {
        entitlementChecks += 1
        return true
      },
    },
  })
  const entry = await server._scheduler.schedule({
    ownerSubject: 'sub-suspended',
    platforms: ['zhihu'],
    title: '不得发布',
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
  })

  await server._scheduler._execute(entry)
  assert.strictEqual(entry.status, 'failed')
  assert.match(entry.error, /BUSINESS_USER_SUSPENDED/)
  assert.strictEqual(entitlementChecks, 0, '用户已暂停时不应继续查询或授予权益')
})

test('启用 Logto 后拒绝无 ownerSubject 的历史定时任务', async () => {
  const server = new PublishApiServer({
    dryRun: true,
    enableSchedule: true,
    logtoVerifier: { async verify() { return { subject: 'sub-any', scopes: [] } } },
    businessIdentityRepository: {
      async findBySubject() { throw new Error('缺少 owner 时不应查询任意用户') },
    },
    entitlementProvider: { async requireFeature() { return true } },
  })
  const entry = await server._scheduler.schedule({
    platforms: ['zhihu'],
    title: '历史无主任务',
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
  })

  await server._scheduler._execute(entry)
  assert.strictEqual(entry.status, 'failed')
  assert.strictEqual(entry.error, 'SCHEDULE_OWNER_REQUIRED')
})
