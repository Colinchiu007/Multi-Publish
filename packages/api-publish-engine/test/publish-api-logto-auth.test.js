const assert = require('assert')
const http = require('http')
const { PublishApiServer } = require('../src/publish-api-server')

function request(port, method, path, token, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
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

function requestWithQuery(port, method, path, token, body) {
  return request(port, method, path, token, body)
}

async function main() {
  const activeRepository = {
    async findBySubject(provider, subject) {
      return { id: `business-${subject}`, auth_provider: provider, auth_subject: subject, status: 'active' }
    },
    async create(record) {
      return record
    },
  }
  const allowedEntitlementProvider = {
    async getForUser() {
      return { plan: 'pro', features: ['cloud_publish'] }
    },
    async consumeFeature() {
      return { used: 1, remaining: null }
    },
  }
  const verifier = {
    verify: async (token) => {
      if (token === 'read-token') return { subject: 'sub-1', scopes: ['publish:read'] }
      if (token === 'write-token') return { subject: 'sub-1', scopes: ['publish:read', 'publish:submit'] }
      throw Object.assign(new Error('AUTH_SIGNATURE_INVALID'), { code: 'AUTH_SIGNATURE_INVALID', status: 401 })
    },
  }
  const server = new PublishApiServer({
    dryRun: true,
    logtoVerifier: verifier,
    businessIdentityRepository: activeRepository,
    entitlementProvider: allowedEntitlementProvider,
  })
  await server.start(0)
  const port = server._server.address().port
  try {
    assert.strictEqual((await request(port, 'GET', '/api/v1/health')).status, 200)
    assert.strictEqual((await request(port, 'GET', '/api/v1/platforms')).status, 401)
    assert.strictEqual((await request(port, 'POST', '/api/v1/publish', 'read-token', { platform: 'zhihu', title: 'x' })).status, 403)
    assert.strictEqual((await request(port, 'POST', '/api/v1/publish', 'write-token', { platform: 'zhihu', title: 'x' })).status, 200)
    assert.strictEqual(server._lastAuthSubject, undefined, '服务实例不能保存跨请求共享的认证 subject')
    console.log('  ✅ PublishApiServer Logto Bearer 与 scope 集成')
  } finally {
    await server.stop()
  }

  const subjects = new Map([
    ['token-a', 'sub-a'],
    ['token-b', 'sub-b'],
  ])
  const repositoryCalls = []
  const repository = {
    async findBySubject(provider, subject) {
      repositoryCalls.push(['find', provider, subject])
      await new Promise((resolve) => setTimeout(resolve, subject === 'sub-a' ? 15 : 1))
      return null
    },
    async create(record) {
      repositoryCalls.push(['create', record.auth_subject])
      return { ...record }
    },
  }
  const concurrentVerifier = {
    verify: async (token) => {
      await new Promise((resolve) => setTimeout(resolve, token === 'token-a' ? 10 : 0))
      const subject = subjects.get(token)
      if (!subject) throw Object.assign(new Error('invalid'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
      return { subject, scopes: ['profile:read', 'publish:read', 'publish:submit'] }
    },
  }
  const isolatedServer = new PublishApiServer({
    dryRun: true,
    logtoVerifier: concurrentVerifier,
    businessIdentityRepository: repository,
    entitlementProvider: allowedEntitlementProvider,
  })
  await isolatedServer.start(0)
  const isolatedPort = isolatedServer._server.address().port
  try {
    const created = await Promise.all([
      requestWithQuery(isolatedPort, 'POST', '/api/v1/plan', 'token-a', { name: 'A', user_id: 'sub-b', items: [{ platform: 'zhihu' }] }),
      requestWithQuery(isolatedPort, 'POST', '/api/v1/plan', 'token-b', { name: 'B', user_id: 'sub-a', items: [{ platform: 'douyin' }] }),
    ])
    assert.deepStrictEqual(created.map((result) => result.status), [200, 200])
    assert(created.every((result) => !Object.prototype.hasOwnProperty.call(result.body.plan, 'ownerSubject')), '响应不能泄露内部 ownerSubject')
    const [listA, listB] = await Promise.all([
      requestWithQuery(isolatedPort, 'GET', '/api/v1/plan', 'token-a'),
      requestWithQuery(isolatedPort, 'GET', '/api/v1/plan', 'token-b'),
    ])
    assert.deepStrictEqual(listA.body.plans.map((plan) => plan.name), ['A'])
    assert.deepStrictEqual(listB.body.plans.map((plan) => plan.name), ['B'])
    const crossUserDelete = await requestWithQuery(isolatedPort, 'POST', '/api/v1/plan/delete', 'token-a', { id: created[1].body.plan.id, user_id: 'sub-b' })
    assert.strictEqual(crossUserDelete.status, 404)
    assert(repositoryCalls.some((call) => call[0] === 'create' && call[1] === 'sub-a'))
    assert(repositoryCalls.some((call) => call[0] === 'create' && call[1] === 'sub-b'))
    console.log('  ✅ PublishApiServer 按请求 sub 隔离资源并 lazy upsert 业务用户')
  } finally {
    await isolatedServer.stop()
  }

  const meRepository = {
    async findBySubject(provider, subject) {
      return { id: 'business-user-1', auth_provider: provider, auth_subject: subject, status: 'active', display_name: '用户甲' }
    },
    async create() {
      throw new Error('已有用户不应重复创建')
    },
  }
  const entitlementProvider = {
    async getForUser({ auth, businessUser }) {
      assert.strictEqual(auth.subject, 'sub-me')
      assert.strictEqual(businessUser.id, 'business-user-1')
      return { plan: 'pro', features: ['cloud_publish'], quota: { cloud_publish_monthly: 100 } }
    },
  }
  const entitlementSigner = {
    async sign(snapshot) {
      return { ...snapshot, kid: 'entitlement-key-1', signature: 'signed-value' }
    },
  }
  const meServer = new PublishApiServer({
    dryRun: true,
    logtoVerifier: { verify: async () => ({ subject: 'sub-me', scopes: ['profile:read'] }) },
    businessIdentityRepository: meRepository,
    entitlementProvider,
    entitlementSigner,
  })
  await meServer.start(0)
  const mePort = meServer._server.address().port
  try {
    const deviceId = 'device-1234567890abcdef'
    const me = await request(mePort, 'GET', '/api/v1/me', 'me-token', undefined, { 'X-Device-ID': deviceId })
    assert.strictEqual(me.status, 200)
    assert.deepStrictEqual(me.body.user, { id: 'business-user-1', status: 'active', displayName: '用户甲', avatarUrl: null })
    assert.deepStrictEqual(me.body.entitlement, { plan: 'pro', features: ['cloud_publish'], quota: { cloud_publish_monthly: 100 } })
    assert.strictEqual(me.body.entitlementSnapshot.sub, 'sub-me')
    assert.strictEqual(me.body.entitlementSnapshot.device_id, deviceId)
    assert.strictEqual(me.body.entitlementSnapshot.plan, 'pro')
    assert.deepStrictEqual(me.body.entitlementSnapshot.features, ['cloud_publish'])
    assert.deepStrictEqual(me.body.entitlementSnapshot.quota, { cloud_publish_monthly: 100 })
    assert.strictEqual(me.body.entitlementSnapshot.kid, 'entitlement-key-1')
    assert.strictEqual(me.body.entitlementSnapshot.signature, 'signed-value')
    assert(Number.isFinite(me.body.entitlementSnapshot.iat))
    assert(me.body.entitlementSnapshot.exp > me.body.entitlementSnapshot.iat)
    const invalidDevice = await request(mePort, 'GET', '/api/v1/me', 'me-token', undefined, { 'X-Device-ID': '../bad' })
    assert.strictEqual(invalidDevice.status, 400)
    assert.strictEqual(invalidDevice.body.error, 'DEVICE_ID_INVALID')
    console.log('  ✅ /api/v1/me 返回业务用户与服务端权威 entitlement')
  } finally {
    await meServer.stop()
  }

  const deniedVerifier = { verify: async () => ({ subject: 'sub-denied', scopes: ['publish:read', 'publish:submit'] }) }
  const deniedServer = new PublishApiServer({
    dryRun: true,
    logtoVerifier: deniedVerifier,
    businessIdentityRepository: activeRepository,
    entitlementProvider: { getForUser: async () => ({ plan: 'free', features: [] }) },
  })
  await deniedServer.start(0)
  try {
    const denied = await request(deniedServer._server.address().port, 'POST', '/api/v1/publish', 'denied-token', { platform: 'zhihu' })
    assert.strictEqual(denied.status, 403)
    assert.strictEqual(denied.body.error, 'ENTITLEMENT_FEATURE_REQUIRED')
  } finally {
    await deniedServer.stop()
  }

  const noProviderServer = new PublishApiServer({ dryRun: true, logtoVerifier: deniedVerifier, businessIdentityRepository: activeRepository })
  await noProviderServer.start(0)
  try {
    const unavailable = await request(noProviderServer._server.address().port, 'POST', '/api/v1/publish', 'denied-token', { platform: 'zhihu' })
    assert.strictEqual(unavailable.status, 503)
    assert.strictEqual(unavailable.body.error, 'ENTITLEMENT_PROVIDER_NOT_CONFIGURED')
  } finally {
    await noProviderServer.stop()
  }

  const suspendedServer = new PublishApiServer({
    dryRun: true,
    logtoVerifier: { verify: async () => ({ subject: 'sub-suspended', scopes: ['publish:read'] }) },
    businessIdentityRepository: {
      findBySubject: async () => ({ id: 'suspended-user', auth_subject: 'sub-suspended', status: 'suspended' }),
      create: async () => { throw new Error('不应创建已存在用户') },
    },
    entitlementProvider: allowedEntitlementProvider,
  })
  await suspendedServer.start(0)
  try {
    const suspended = await request(suspendedServer._server.address().port, 'GET', '/api/v1/platforms', 'suspended-token')
    assert.strictEqual(suspended.status, 403)
    assert.strictEqual(suspended.body.error, 'BUSINESS_USER_SUSPENDED')
    console.log('  ✅ 暂停用户和无权 entitlement 在路由执行前被拒绝')
  } finally {
    await suspendedServer.stop()
  }

  const leakingError = 'C:\\Users\\internal\\publisher.js: secret=top-secret'
  const failingServer = new PublishApiServer({
    logtoVerifier: { verify: async () => ({ subject: 'sub-failure', scopes: ['publish:submit'] }) },
    businessIdentityRepository: activeRepository,
    entitlementProvider: allowedEntitlementProvider,
    publishViaApi: async () => { throw new Error(leakingError) },
  })
  await failingServer.start(0)
  try {
    const failed = await request(
      failingServer._server.address().port,
      'POST',
      '/api/v1/publish',
      'failure-token',
      { platform: 'zhihu', title: 'x' },
    )
    assert.strictEqual(failed.status, 200)
    assert.strictEqual(failed.body.success, false)
    assert.strictEqual(failed.body.error, 'PUBLISH_FAILED')
    assert(!JSON.stringify(failingServer._auditLog.list()).includes(leakingError))
    console.log('  ✅ 发布失败响应和审计日志不泄露内部错误')
  } finally {
    await failingServer.stop()
  }
}

main().catch((error) => {
  console.error(`  ❌ PublishApiServer Logto: ${error.stack || error.message}`)
  process.exitCode = 1
})
