const assert = require('assert')
const http = require('http')
const test = require('node:test')

function request(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }))
    }).on('error', reject)
  })
}

test('生产 readiness probe', async (t) => {
  const { createProductionReadinessProbe } = require('../src/auth/production-readiness')

  await t.test('数据库 schema、OIDC 和 JWKS 全部正常时 ready', async () => {
    const probe = createProductionReadinessProbe({
      repository: { assertReady: async () => ({ database: 'ready', schema: 'ready' }) },
      verifier: { checkReady: async () => ({ oidc: 'ready', jwks: 'ready', signingKeys: 2 }) },
      clockMs: (() => { let value = 100; return () => value += 5 })(),
    })

    assert.deepStrictEqual(await probe.check(), {
      status: 'ready',
      checks: {
        database: { status: 'ready' },
        schema: { status: 'ready' },
        oidc: { status: 'ready' },
        jwks: { status: 'ready', signingKeys: 2 },
      },
      durationMs: 5,
    })
  })

  await t.test('依赖失败时 not_ready 且不泄露异常原文', async () => {
    const databaseSecret = 'postgresql://user:secret@db.example.com/private'
    const oidcSecret = 'Bearer hidden-access-token'
    const databaseError = Object.assign(new Error(databaseSecret), { code: 'BUSINESS_DATABASE_SCHEMA_NOT_READY' })
    const oidcError = Object.assign(new Error(oidcSecret), { code: 'AUTH_DISCOVERY_UNAVAILABLE' })
    const probe = createProductionReadinessProbe({
      repository: { assertReady: async () => { throw databaseError } },
      verifier: { checkReady: async () => { throw oidcError } },
    })

    const result = await probe.check()
    assert.strictEqual(result.status, 'not_ready')
    assert.strictEqual(result.checks.database.code, 'BUSINESS_DATABASE_SCHEMA_NOT_READY')
    assert.strictEqual(result.checks.oidc.code, 'AUTH_DISCOVERY_UNAVAILABLE')
    assert.strictEqual(JSON.stringify(result).includes(databaseSecret), false)
    assert.strictEqual(JSON.stringify(result).includes(oidcSecret), false)
  })

  await t.test('并发和短周期重复探测复用同一次依赖检查', async () => {
    let now = 1000
    let databaseCalls = 0
    let oidcCalls = 0
    let releaseDatabase
    const database = new Promise((resolve) => { releaseDatabase = resolve })
    const probe = createProductionReadinessProbe({
      repository: { assertReady: async () => { databaseCalls += 1; await database } },
      verifier: { checkReady: async () => { oidcCalls += 1; return { signingKeys: 1 } } },
      clockMs: () => now,
      cacheTtlMs: 1000,
    })

    const first = probe.check()
    const concurrent = probe.check()
    releaseDatabase()
    assert.deepStrictEqual(await Promise.all([first, concurrent]), [await first, await first])
    assert.strictEqual(databaseCalls, 1)
    assert.strictEqual(oidcCalls, 1)

    now += 500
    await probe.check()
    assert.strictEqual(databaseCalls, 1)
    now += 1001
    await probe.check()
    assert.strictEqual(databaseCalls, 2)
  })
})

test('PublishApiServer 分离 liveness 和 readiness', async (t) => {
  const { PublishApiServer } = require('../src/publish-api-server')

  await t.test('required auth 模式下 ready 无需 Token 且成功返回 200', async () => {
    const server = new PublishApiServer({
      dryRun: true,
      logtoVerifier: { verify: async () => { throw new Error('不应验签') } },
      identityAuthRequired: true,
      readinessProbe: { check: async () => ({ status: 'ready', checks: { database: { status: 'ready' } }, durationMs: 1 }) },
    })
    const port = await server.start(0)
    try {
      const ready = await request(port, '/api/v1/ready')
      assert.strictEqual(ready.status, 200)
      assert.strictEqual(ready.body.status, 'ready')
      const readyWithQuery = await request(port, '/api/v1/ready?source=container')
      assert.strictEqual(readyWithQuery.status, 200)
      assert.strictEqual(readyWithQuery.body.status, 'ready')
      const health = await request(port, '/api/v1/health')
      assert.strictEqual(health.status, 200)
      assert.strictEqual(health.body.status, 'ok')
    } finally {
      await server.stop()
    }
  })

  await t.test('readiness 失败返回 503，liveness 仍保持 200', async () => {
    const server = new PublishApiServer({
      dryRun: true,
      readinessProbe: { check: async () => ({ status: 'not_ready', checks: { oidc: { status: 'failed', code: 'AUTH_DISCOVERY_UNAVAILABLE' } }, durationMs: 1 }) },
    })
    const port = await server.start(0)
    try {
      assert.strictEqual((await request(port, '/api/v1/ready')).status, 503)
      assert.strictEqual((await request(port, '/api/v1/health')).status, 200)
    } finally {
      await server.stop()
    }
  })
})
