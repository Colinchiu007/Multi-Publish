const fs = require('fs')
const path = require('path')

describe('identity runtime public config', () => {
  const configPath = 'C:/fixture/identity-public.json'
  const productionConfigPath = path.resolve(
    __dirname, '..', '..', '..', '..', '..', 'config', 'identity-public.json',
  )
  const entitlementPublicKey = JSON.parse(fs.readFileSync(productionConfigPath, 'utf8')).entitlementPublicKey

  function config(overrides = {}) {
    return {
      version: 1,
      identityAuthEnabled: true,
      identityAuthRequired: false,
      logtoEndpoint: 'https://auth.example.com',
      logtoAppId: 'native-app-id',
      logtoApiResource: 'https://api.example.com',
      businessApiUrl: 'https://business.example.com',
      logtoRedirectUri: 'http://127.0.0.1:16526/auth/callback',
      logtoScopes: ['openid', 'profile', 'offline_access', 'profile:read'],
      entitlementKeyId: 'entitlement-key-1',
      entitlementPublicKey,
      ...overrides,
    }
  }

  function load(options = {}) {
    const { loadIdentityRuntimeEnv } = require('./identity-runtime-config')
    return loadIdentityRuntimeEnv({
      configPath,
      existsSync: () => true,
      readFileSync: () => JSON.stringify(config()),
      ...options,
    })
  }

  it('仅映射白名单公开字段，并允许受控环境覆盖发行配置', () => {
    const result = load({
      env: {
        BUSINESS_API_URL: 'https://canary.example.com',
        UNRELATED_ENV: 'kept',
        ENTITLEMENT_PRIVATE_KEY: 'server-only',
      },
    })

    expect(result).toMatchObject({
      IDENTITY_AUTH_ENABLED: 'true',
      IDENTITY_AUTH_REQUIRED: 'false',
      LOGTO_ENDPOINT: 'https://auth.example.com',
      LOGTO_APP_ID: 'native-app-id',
      LOGTO_API_RESOURCE: 'https://api.example.com',
      BUSINESS_API_URL: 'https://canary.example.com',
      LOGTO_REDIRECT_URI: 'http://127.0.0.1:16526/auth/callback',
      LOGTO_SCOPES: 'openid profile offline_access profile:read',
      ENTITLEMENT_KEY_ID: 'entitlement-key-1',
      ENTITLEMENT_PUBLIC_KEY: entitlementPublicKey,
    })
    expect(result).not.toHaveProperty('UNRELATED_ENV')
    expect(result).not.toHaveProperty('ENTITLEMENT_PRIVATE_KEY')
  })

  it('允许受控进程环境在不重发安装包时回滚 required 开关', () => {
    const result = load({
      env: { IDENTITY_AUTH_REQUIRED: 'false' },
      readFileSync: () => JSON.stringify(config({ identityAuthRequired: true })),
    })

    expect(result.IDENTITY_AUTH_ENABLED).toBe('true')
    expect(result.IDENTITY_AUTH_REQUIRED).toBe('false')
  })

  it('发行配置的身份启用开关不能被进程环境静默关闭', () => {
    const result = load({
      env: { IDENTITY_AUTH_ENABLED: 'false' },
    })

    expect(result.IDENTITY_AUTH_ENABLED).toBe('true')
  })

  it('拒绝环境覆盖后形成的认证开关矛盾或非法布尔值', () => {
    expect(() => load({
      env: { IDENTITY_AUTH_REQUIRED: 'true' },
      readFileSync: () => JSON.stringify(config({ identityAuthEnabled: false })),
    })).toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
    expect(() => load({
      env: { IDENTITY_AUTH_REQUIRED: 'sometimes' },
    })).toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('配置文件不存在时仍校验旧式环境中的身份启用开关', () => {
    expect(() => load({
      env: { IDENTITY_AUTH_ENABLED: 'sometimes' },
      existsSync: () => false,
    })).toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('配置文件不存在时保持公开身份环境兼容', () => {
    const env = {
      IDENTITY_AUTH_ENABLED: 'true',
      LOGTO_ENDPOINT: 'https://env.example.com',
      UNRELATED_ENV: 'not-forwarded',
    }
    const result = load({ env, existsSync: () => false })

    expect(result).toEqual({
      IDENTITY_AUTH_ENABLED: 'true',
      LOGTO_ENDPOINT: 'https://env.example.com',
    })
    expect(result).not.toBe(env)
  })

  it('拒绝畸形 JSON，避免静默关闭或部分加载身份服务', () => {
    expect(() => load({ readFileSync: () => '{invalid-json' }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('拒绝无法读取或超过大小上限的发行配置', () => {
    const { MAX_CONFIG_BYTES } = require('./identity-runtime-config')
    expect(() => load({ readFileSync: () => { throw new Error('access denied') } }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
    expect(() => load({ readFileSync: () => 'x'.repeat(MAX_CONFIG_BYTES + 1) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('拒绝未列入白名单的字段，尤其是私钥', () => {
    expect(() => load({ readFileSync: () => JSON.stringify(config({ entitlementPrivateKey: 'secret' })) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('启用身份时拒绝缺失的 entitlement 公钥或 key id', () => {
    const incomplete = config()
    delete incomplete.entitlementPublicKey

    expect(() => load({ readFileSync: () => JSON.stringify(incomplete) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('在身份工厂启动前拒绝无效的 entitlement RSA 公钥', () => {
    expect(() => load({ readFileSync: () => JSON.stringify(config({ entitlementPublicKey: 'not-a-public-key' })) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('拒绝 required 与 disabled 的矛盾配置', () => {
    expect(() => load({ readFileSync: () => JSON.stringify(config({
      identityAuthEnabled: false,
      identityAuthRequired: true,
    })) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('要求显式声明是否启用身份服务', () => {
    const missingEnabled = config()
    delete missingEnabled.identityAuthEnabled

    expect(() => load({ readFileSync: () => JSON.stringify(missingEnabled) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('显式 scopes 不能遗漏 OIDC 登录和刷新所需的基础 scope', () => {
    expect(() => load({ readFileSync: () => JSON.stringify(config({
      logtoScopes: ['profile:read'],
    })) }))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CONFIG_INVALID' }))
  })

  it('发行资源包含可解析的生产公开配置，且不含私钥字段', () => {
    const source = fs.readFileSync(productionConfigPath, 'utf8')
    const { parseIdentityPublicConfig } = require('./identity-runtime-config')
    const { parseEntitlementPublicKeys } = require('./identity-service-factory')
    const { normalizeEndpoint } = require('./logto-client')
    const { normalizeApiUrl } = require('./entitlement-service')

    const env = parseIdentityPublicConfig(source)
    expect(() => normalizeEndpoint(env.LOGTO_ENDPOINT)).not.toThrow()
    expect(() => normalizeApiUrl(env.BUSINESS_API_URL)).not.toThrow()
    expect(Object.keys(parseEntitlementPublicKeys(env))).toEqual([env.ENTITLEMENT_KEY_ID])
    expect(source).not.toMatch(/private[_-]?key|client[_-]?secret/i)
  })
})
