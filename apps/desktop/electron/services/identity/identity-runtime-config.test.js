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

// 2026-10-07 安全加固：发行公钥不可被配置/环境替换。
//
// 逃逸分析：`identity-public.json` 被打包进 <安装目录>/resources/config/，位于
// app.asar **之外**的普通文件，用户可编辑；`CONFIG_ENV_OVERRIDE_KEYS` 还允许用
// **进程环境变量**覆盖同一批字段。原实现 `validateEntitlementPublicKey` 只校验
// **格式**（能解析 + RSA），换一把自己生成的 RSA 公钥完全合法。配合可改的
// `businessApiUrl`，即可起假 `/api/v1/me` 返回自签权益并通过本地验签。
describe('发行公钥不可被替换（2026-10-07 加固）', () => {
  const path2 = require('path')
  const fs2 = require('fs')
  const configPath = 'C:/fixture/identity-public.json'
  const productionConfigPath = path2.resolve(
    __dirname, '..', '..', '..', '..', '..', 'config', 'identity-public.json',
  )
  const realKey = JSON.parse(fs2.readFileSync(productionConfigPath, 'utf8')).entitlementPublicKey
  const realKeyId = JSON.parse(fs2.readFileSync(productionConfigPath, 'utf8')).entitlementKeyId

  // 一把格式完全合法的「攻击者」公钥：RSA、能被 createPublicKey 解析——
  // 原实现的 validateEntitlementPublicKey 必然放行。
  const crypto = require('crypto')
  const { publicKey: forged } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  function cfg(overrides = {}) {
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
      entitlementKeyId: realKeyId,
      entitlementPublicKey: realKey,
      ...overrides,
    }
  }

  function load(options = {}) {
    const { loadIdentityRuntimeEnv } = require('./identity-runtime-config')
    return loadIdentityRuntimeEnv({
      configPath,
      existsSync: () => true,
      readFileSync: () => JSON.stringify(cfg(options.configOverrides || {})),
      ...options,
    })
  }

  it('packaged + 配置换成攻击者自签公钥 ⇒ 抛错（格式合法也不放行）', () => {
    expect(() => load({
      isPackaged: true,
      configOverrides: { entitlementPublicKey: forged },
    })).toThrow(/与内置发行公钥不一致/)
  })

  it('packaged + 环境变量覆盖公钥 ⇒ 同样抛错（两条路径都要堵）', () => {
    expect(() => load({ isPackaged: true, env: { ENTITLEMENT_PUBLIC_KEY: forged } }))
      .toThrow(/与内置发行公钥不一致/)
  })

  it('packaged + 未内置的 keyId ⇒ 抛错', () => {
    expect(() => load({ isPackaged: true, configOverrides: { entitlementKeyId: 'attacker-key' } }))
      .toThrow(/未内置/)
  })

  it('packaged + 真实发行公钥 ⇒ 正常通过（防止把门禁写死成恒抛）', () => {
    const env = load({ isPackaged: true })
    expect(env.ENTITLEMENT_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY')
    expect(env.ENTITLEMENT_KEY_ID).toBe(realKeyId)
  })

  it('packaged + 公钥仅 CRLF 换行差异 ⇒ 仍通过（不是逐字节死比较）', () => {
    const env = load({ isPackaged: true, configOverrides: { entitlementPublicKey: realKey.replace(/\n/g, '\r\n') } })
    expect(env.ENTITLEMENT_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY')
  })

  it('非 packaged（开发态）⇒ 允许自定义公钥，否则本地测试密钥无法使用', () => {
    const env = load({ isPackaged: false, configOverrides: { entitlementPublicKey: forged } })
    expect(env.ENTITLEMENT_PUBLIC_KEY).toBe(forged)
  })

  // 2026-10-07 SELF-REVIEW 发现：原判定 `isPackaged !== true` 会被 1 / 'true'
  // 这类真值静默降级为「宽松」，与 license:activate(#3085) 的严格不等口径不一致。
  it.each([[1], ['true'], [{}], [[]]])('isPackaged=%j 非布尔真值 ⇒ 抛错而非静默放宽', (bogus) => {
    expect(() => load({ isPackaged: bogus })).toThrow(/必须是布尔值/)
  })

  it('身份未启用时不因缺公钥而抛错（不越权拦截）', () => {
    const { loadIdentityRuntimeEnv } = require('./identity-runtime-config')
    const env = loadIdentityRuntimeEnv({
      configPath, existsSync: () => true, isPackaged: true,
      readFileSync: () => JSON.stringify(cfg({ identityAuthEnabled: false, entitlementPublicKey: forged })),
    })
    expect(env.IDENTITY_AUTH_ENABLED).toBe('false')
  })
})
