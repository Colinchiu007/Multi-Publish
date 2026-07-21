const assert = require('assert')
const crypto = require('crypto')
const test = require('node:test')

function validEnv(overrides = {}) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    NODE_ENV: 'production',
    IDENTITY_AUTH_ENABLED: 'true',
    IDENTITY_AUTH_REQUIRED: 'false',
    BUSINESS_DATABASE_AUTO_MIGRATE: 'false',
    LOGTO_ENDPOINT: 'https://id.example.com',
    LOGTO_API_RESOURCE: 'https://api.example.com',
    BUSINESS_DATABASE_URL: 'postgresql://app:strongpassword@databases.example.com:5432/multi_publish',
    LOGTO_DATABASE_URL: 'postgresql://logto:strongpassword@databases.example.com:5432/logto',
    LOGTO_WEBHOOK_SIGNING_KEY: 'w'.repeat(48),
    ENTITLEMENT_KEY_ID: 'entitlement-2026-07',
    ENTITLEMENT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ...overrides,
  }
}

test('生产配置校验', async (t) => {
  const { validateProductionConfig } = require('../src/auth/production-config')

  await t.test('shadow 与 required 阶段的完整配置通过', () => {
    const shadow = validateProductionConfig(validEnv(), { phase: 'shadow' })
    assert.strictEqual(shadow.valid, true)
    assert.deepStrictEqual(shadow.errors, [])

    const required = validateProductionConfig(validEnv({ IDENTITY_AUTH_REQUIRED: 'true' }), { phase: 'required' })
    assert.strictEqual(required.valid, true)
  })

  await t.test('缺失 Secret、生产自动迁移和矛盾开关全部 fail closed', () => {
    const result = validateProductionConfig(validEnv({
      IDENTITY_AUTH_ENABLED: 'false',
      IDENTITY_AUTH_REQUIRED: 'true',
      BUSINESS_DATABASE_AUTO_MIGRATE: 'true',
      LOGTO_WEBHOOK_SIGNING_KEY: '',
      ENTITLEMENT_PRIVATE_KEY: '',
    }), { phase: 'required' })

    assert.strictEqual(result.valid, false)
    const codes = result.errors.map((error) => error.code)
    assert(codes.includes('AUTH_FLAGS_CONFLICT'))
    assert(codes.includes('PRODUCTION_AUTO_MIGRATE_FORBIDDEN'))
    assert(codes.includes('WEBHOOK_SIGNING_KEY_REQUIRED'))
    assert(codes.includes('ENTITLEMENT_PRIVATE_KEY_REQUIRED'))
  })

  await t.test('公网 HTTP issuer、非 PostgreSQL URL 和 Logto/业务同库被拒绝', () => {
    const invalidUrl = validateProductionConfig(validEnv({
      LOGTO_ENDPOINT: 'http://id.example.com',
      BUSINESS_DATABASE_URL: 'mysql://app:password@db.example.com/multi_publish',
    }))
    assert(invalidUrl.errors.some((error) => error.code === 'LOGTO_ENDPOINT_HTTPS_REQUIRED'))
    assert(invalidUrl.errors.some((error) => error.code === 'BUSINESS_DATABASE_URL_INVALID'))

    const sameDatabase = validateProductionConfig(validEnv({
      BUSINESS_DATABASE_URL: 'postgresql://app:one@db.example.com:5432/shared',
      LOGTO_DATABASE_URL: 'postgresql://logto:two@db.example.com:5432/shared',
    }))
    assert(sameDatabase.errors.some((error) => error.code === 'DATABASE_SEPARATION_REQUIRED'))
  })

  await t.test('空白凭据和弱数据库口令被拒绝', () => {
    const result = validateProductionConfig(validEnv({
      BUSINESS_DATABASE_URL: 'postgresql://app:short@databases.example.com/multi_publish',
      LOGTO_DATABASE_URL: 'postgresql://:strongpassword@databases.example.com/logto',
    }))

    assert.strictEqual(result.valid, false)
    assert(result.errors.some((entry) => entry.code === 'DATABASE_PASSWORD_TOO_SHORT' && entry.variable === 'BUSINESS_DATABASE_URL'))
    assert(result.errors.some((entry) => entry.code === 'DATABASE_CREDENTIALS_REQUIRED' && entry.variable === 'LOGTO_DATABASE_URL'))
  })

  await t.test('错误结果不包含任何 Secret 原文', () => {
    const secret = 'super-secret-webhook-value-that-must-not-leak'
    const result = validateProductionConfig(validEnv({ LOGTO_WEBHOOK_SIGNING_KEY: secret.slice(0, 10) }))
    assert.strictEqual(JSON.stringify(result).includes(secret), false)
    assert.strictEqual(JSON.stringify(result).includes(secret.slice(0, 10)), false)
  })
})
