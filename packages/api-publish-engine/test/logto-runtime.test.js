const assert = require('assert')
const crypto = require('crypto')
const test = require('node:test')

function productionEnv(overrides = {}) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    NODE_ENV: 'production', IDENTITY_AUTH_ENABLED: 'true', IDENTITY_AUTH_REQUIRED: 'false',
    BUSINESS_DATABASE_AUTO_MIGRATE: 'false',
    LOGTO_ENDPOINT: 'https://id.example.com', LOGTO_API_RESOURCE: 'https://api.example.com',
    BUSINESS_DATABASE_URL: 'postgresql://app:fixturepassword@db.example.com/multi_publish',
    LOGTO_WEBHOOK_SIGNING_KEY: 'w'.repeat(32), ENTITLEMENT_KEY_ID: 'key-1',
    ENTITLEMENT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ...overrides,
  }
}

test('createLogtoRuntime', async (t) => {
  await t.test('身份开关关闭时不创建数据库连接', async () => {
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    assert.strictEqual(await createLogtoRuntime({ env: { IDENTITY_AUTH_ENABLED: 'false' } }), null)
  })

  await t.test('生产环境未启用身份系统时 fail closed', async () => {
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(
      createLogtoRuntime({
        env: {
          NODE_ENV: 'production',
          IDENTITY_AUTH_ENABLED: 'false',
          IDENTITY_AUTH_REQUIRED: 'false',
        },
      }),
      (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID' && error.message.includes('AUTH_ENABLED_REQUIRED'),
    )
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

  await t.test('生产环境默认禁止启动 DDL，只执行 schema readiness', async () => {
    let initialized = 0
    let checked = 0
    const repository = {
      initialize: async () => { initialized += 1 },
      assertReady: async () => { checked += 1; return { database: 'ready', schema: 'ready' } },
      close: async () => {},
    }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await createLogtoRuntime({
      env: {
        ...productionEnv(),
      },
      repository,
      createVerifier: () => ({}),
      createWebhookConsumer: () => ({}),
      entitlementProvider: {},
    })

    assert.strictEqual(initialized, 0)
    assert.strictEqual(checked, 1)
  })

  await t.test('生产环境显式开启自动迁移时 fail closed', async () => {
    const repository = { initialize: async () => {}, assertReady: async () => {}, close: async () => {} }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(createLogtoRuntime({
      env: productionEnv({ BUSINESS_DATABASE_AUTO_MIGRATE: 'true' }),
      repository,
      createVerifier: () => ({}),
      entitlementProvider: {},
    }), (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID')
  })

  await t.test('生产环境缺失 Webhook 或权益签名配置时 fail closed', async () => {
    const repository = { initialize: async () => {}, assertReady: async () => {}, close: async () => {} }
    const { createLogtoRuntime } = require('../src/auth/logto-runtime')
    await assert.rejects(createLogtoRuntime({
      env: productionEnv({ LOGTO_WEBHOOK_SIGNING_KEY: '', ENTITLEMENT_PRIVATE_KEY: '' }),
      repository,
      createVerifier: () => ({}),
      entitlementProvider: {},
    }), (error) => error && error.code === 'LOGTO_RUNTIME_CONFIG_INVALID' && /WEBHOOK_SIGNING_KEY_REQUIRED/.test(error.message))
  })
})
