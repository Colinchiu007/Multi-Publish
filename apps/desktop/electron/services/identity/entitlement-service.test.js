const crypto = require('crypto')

function sign(payload, privateKey) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')
  return `${encoded}.${signature}`
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('EntitlementService', () => {
  function createFixture(overrides = {}) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const payload = {
      sub: 'sub-1', device_id: 'device-1', plan: 'pro', features: ['cloud_publish'],
      quota: { cloud_publish_monthly: 100 }, iat: 100, exp: 200, kid: 'key-1',
    }
    const token = sign(payload, privateKey)
    let persisted = null
    const storage = {
      save: vi.fn(async (value) => { persisted = value }),
      load: vi.fn(async () => persisted),
      clear: vi.fn(async () => { persisted = null }),
    }
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 'user-1', status: 'active' },
        entitlement: { plan: 'pro', features: ['cloud_publish'], quota: payload.quota },
        entitlementSnapshot: { token },
      }),
    }))
    const { EntitlementService } = require('./entitlement-service')
    const service = new EntitlementService({
      apiUrl: 'https://api.example.com',
      deviceId: 'device-1',
      publicKeys: { 'key-1': publicKey },
      storage,
      fetcher,
      now: () => 150,
      ...overrides,
    })
    return { service, storage, fetcher, token, payload, getPersisted: () => persisted }
  }

  it('在线同步 /api/v1/me，携带 Bearer 与设备 ID 并缓存有效签名快照', async () => {
    const { service, fetcher, token, getPersisted } = createFixture()

    await expect(service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .resolves.toMatchObject({ plan: 'pro', features: ['cloud_publish'], source: 'online' })
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/api/v1/me', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer access-1', 'X-Device-Id': 'device-1' }),
    }))
    expect(getPersisted()).toEqual({ token })
  })

  it('离线恢复只接受绑定当前账号和设备且未过期的签名快照', async () => {
    const { service, storage, token } = createFixture()
    await storage.save({ token })

    await expect(service.restore('sub-1'))
      .resolves.toMatchObject({ plan: 'pro', features: ['cloud_publish'], source: 'offline' })
    await expect(service.restore('sub-other')).resolves.toBeNull()
    expect(storage.clear).toHaveBeenCalled()
  })

  it('服务端用户被暂停时拒绝同步权益并清缓存', async () => {
    const { service, storage } = createFixture({
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: { status: 'suspended' }, entitlement: { plan: 'pro', features: ['cloud_publish'] } }),
      }),
    })

    await expect(service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_USER_INACTIVE' })
    expect(storage.clear).toHaveBeenCalled()
  })

  it('在线同步失败不会把离线缓存冒充为在线写权限', async () => {
    const { service } = createFixture({ fetcher: async () => { throw new Error('network down') } })

    await expect(service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(service.hasFeature('cloud_publish', { onlineOnly: true })).toBe(false)
  })

  it('clear 后才完成的旧同步不能恢复权益和缓存', async () => {
    const response = deferred()
    const fixture = createFixture({ fetcher: vi.fn(() => response.promise) })

    const syncing = fixture.service.sync({ subject: 'sub-1', accessToken: 'access-old' })
    await fixture.service.clear()
    response.resolve({
      ok: true,
      json: async () => ({
        user: { status: 'active' },
        entitlement: { plan: 'pro', features: ['cloud_publish'] },
        entitlementSnapshot: { token: fixture.token },
      }),
    })

    await syncing
    expect(fixture.service.getState()).toBeNull()
    expect(fixture.getPersisted()).toBeNull()
  })

  it('两个账号并发同步时只保留最后发起的账号', async () => {
    const responseA = deferred()
    const responseB = deferred()
    const fetcher = vi.fn((_url, options) => options.headers.Authorization === 'Bearer access-a'
      ? responseA.promise
      : responseB.promise)
    const { service } = createFixture({ publicKeys: {}, fetcher })
    const syncingA = service.sync({ subject: 'sub-a', accessToken: 'access-a' })
    const syncingB = service.sync({ subject: 'sub-b', accessToken: 'access-b' })
    responseB.resolve({
      ok: true,
      json: async () => ({ user: { status: 'active' }, entitlement: { plan: 'pro', features: ['feature-b'] } }),
    })
    await syncingB
    responseA.resolve({
      ok: true,
      json: async () => ({ user: { status: 'active' }, entitlement: { plan: 'pro', features: ['feature-a'] } }),
    })
    await syncingA

    expect(service.getState()).toMatchObject({ subject: 'sub-b', features: ['feature-b'] })
  })

  it('旧同步失败不能清掉新账号已经写入的权益', async () => {
    const responseA = deferred()
    const responseB = deferred()
    const fetcher = vi.fn((_url, options) => options.headers.Authorization === 'Bearer access-a'
      ? responseA.promise
      : responseB.promise)
    const fixture = createFixture({ publicKeys: {}, fetcher })
    const syncingA = fixture.service.sync({ subject: 'sub-a', accessToken: 'access-a' })
    const syncingB = fixture.service.sync({ subject: 'sub-b', accessToken: 'access-b' })
    responseB.resolve({
      ok: true,
      json: async () => ({ user: { status: 'active' }, entitlement: { plan: 'pro', features: ['feature-b'] } }),
    })
    await syncingB
    responseA.resolve({ ok: false, status: 403, json: async () => ({}) })

    await expect(syncingA).rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(fixture.service.getState()).toMatchObject({ subject: 'sub-b', features: ['feature-b'] })
  })
})
