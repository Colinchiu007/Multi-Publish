const assert = require('assert')
const test = require('node:test')

test('createLogtoRuntime', async (t) => {
  await t.test('身份开关关闭时不创建数据库连接', async () => {
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    assert.strictEqual(await createLogtoRuntime({ env: { IDENTITY_AUTH_ENABLED: 'false' } }), null)
  })

  await t.test('身份开启但未配置业务数据库时 fail closed', async () => {
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(
      createLogtoRuntime({
        env: {
          IDENTITY_AUTH_ENABLED: 'true', LOGTO_ENDPOINT: 'https://id.example.com',
          LOGTO_API_RESOURCE: 'https://api.multi-publish.com',
        },
      }),
      (error) => error.code === 'LOGTO_RUNTIME_CONFIG_INVALID',
    )
  })

  await t.test('身份布尔配置拼写错误时不得静默关闭鉴权', async () => {
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(
      createLogtoRuntime({ env: { IDENTITY_AUTH_ENABLED: 'treu' } }),
      (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID',
    )
  })

  await t.test('从环境变量构建 verifier、业务仓储、权益服务和可选 Webhook', async () => {
    const repository = { initialize: async () => {}, close: async () => {} }
    const verifier = { verify: async () => ({}) }
    const env = {
      IDENTITY_AUTH_ENABLED: 'true', LOGTO_ENDPOINT: 'https://id.example.com',
      LOGTO_API_RESOURCE: 'https://api.multi-publish.com', BUSINESS_DATABASE_URL: 'postgres://db',
      LOGTO_WEBHOOK_SIGNING_KEY: 'webhook-secret',
      LOGTO_WEBHOOK_MAX_EVENT_AGE_SECONDS: '600',
      LOGTO_WEBHOOK_MAX_FUTURE_SKEW_SECONDS: '30',
    }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    const runtime = await createLogtoRuntime({
      env,
      repository,
      createVerifier: (options) => { assert.strictEqual(options.issuer, 'https://id.example.com/oidc'); return verifier },
      createWebhookConsumer: (options) => ({ options }),
      entitlementProvider: { getForUser: async () => ({ plan: 'free', features: [] }) },
    })

    assert.strictEqual(runtime.verifier, verifier)
    assert.strictEqual(runtime.required, false)
    assert.strictEqual(runtime.repository, repository)
    assert.strictEqual(runtime.webhookConsumer.options.signingKey, 'webhook-secret')
    assert.strictEqual(runtime.webhookConsumer.options.maxEventAgeMs, 600000)
    assert.strictEqual(runtime.webhookConsumer.options.maxFutureSkewMs, 30000)
    await runtime.close()
  })

  await t.test('Webhook 时间窗口配置无效时 fail closed', async () => {
    const repository = { initialize: async () => {}, close: async () => {} }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(createLogtoRuntime({
      env: {
        IDENTITY_AUTH_ENABLED: 'true', LOGTO_ENDPOINT: 'https://id.example.com',
        LOGTO_API_RESOURCE: 'https://api.multi-publish.com',
        LOGTO_WEBHOOK_SIGNING_KEY: 'webhook-secret',
        LOGTO_WEBHOOK_MAX_EVENT_AGE_SECONDS: '-1',
      },
      repository,
      createVerifier: () => ({}),
      createWebhookConsumer: () => ({}),
      entitlementProvider: {},
    }), (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID')
  })

  await t.test('JWKS 缓存 TTL 配置必须是正数', async () => {
    const repository = { initialize: async () => {}, close: async () => {} }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    for (const value of ['0', '-1', 'NaN', 'Infinity']) {
      await assert.rejects(createLogtoRuntime({
        env: {
          IDENTITY_AUTH_ENABLED: 'true', LOGTO_ENDPOINT: 'https://id.example.com',
          LOGTO_API_RESOURCE: 'https://api.multi-publish.com', BUSINESS_DATABASE_URL: 'postgres://db',
          LOGTO_JWKS_CACHE_TTL: value,
        },
        repository,
        createVerifier: () => ({}),
        entitlementProvider: {},
      }), (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID')
    }
  })

  await t.test('required=true 明确标记强制 Logto 模式', async () => {
    const repository = { initialize: async () => {}, close: async () => {} }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    const runtime = await createLogtoRuntime({
      env: {
        IDENTITY_AUTH_ENABLED: 'true', IDENTITY_AUTH_REQUIRED: 'true',
        LOGTO_ENDPOINT: 'https://id.example.com', LOGTO_API_RESOURCE: 'https://api.multi-publish.com',
      },
      repository,
      createVerifier: () => ({}),
      entitlementProvider: {},
    })
    assert.strictEqual(runtime.required, true)
  })

  await t.test('数据库初始化失败时关闭连接池', async () => {
    let closed = false
    const repository = {
      initialize: async () => { throw new Error('db down') },
      close: async () => { closed = true },
    }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(createLogtoRuntime({
      env: {
        IDENTITY_AUTH_ENABLED: 'true', LOGTO_ENDPOINT: 'https://id.example.com',
        LOGTO_API_RESOURCE: 'https://api.multi-publish.com',
      },
      repository,
      createVerifier: () => ({}),
    }), /db down/)
    assert.strictEqual(closed, true)
  })
})
