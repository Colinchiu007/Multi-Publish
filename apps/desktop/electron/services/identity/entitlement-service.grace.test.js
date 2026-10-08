// @ts-check
/**
 * entitlement-service.grace.test.js — 会员权益宽限期（design §6，Requirement: 会员权益宽限期）
 *
 * 关键判据（design §6.2）：判据是「**没拿到有效响应**」而非「请求失败」——
 *   fetch 抛异常（网络层）      → 宽限逻辑
 *   !response.ok（401/403 等）  → 不宽限，保持 fail-closed 清权
 *   response.json() 抛异常     → 不宽限（拿到但结构不对 = 契约破坏）
 *   账号 status !== 'active'   → 不宽限，立即清权
 *
 * 宽限期只禁写不禁读：写通道走 hasFeature(feature, { onlineOnly: true })，
 * 而 onlineOnly 要求 source === 'online'，因此 source='grace' 天然禁掉付费消耗，
 * 读通道（非 onlineOnly）不受影响。
 */
const crypto = require('crypto')

function sign (payload, privateKey) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')
  return `${encoded}.${signature}`
}

/** now（秒）与 exp（秒）可分别控制，覆盖未过期 / 宽限期内 / 宽限期外三种情形 */
function createFixture ({ exp = 200, now = 150, fetcher, clockTolerance } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const payload = {
    sub: 'sub-1', device_id: 'device-1', plan: 'pro', features: ['cloud_publish'],
    quota: { cloud_publish_monthly: 100 }, iat: 100, exp, kid: 'key-1',
  }
  const token = sign(payload, privateKey)
  let persisted = null
  const storage = {
    save: vi.fn(async (value) => { persisted = value }),
    load: vi.fn(async () => persisted),
    clear: vi.fn(async () => { persisted = null }),
  }
  const fetchImpl = fetcher || (async () => ({ ok: true, status: 200, json: async () => ({ user: { status: 'active' }, entitlement: { plan: 'pro', features: ['cloud_publish'] } }) }))
  const { EntitlementService } = require('./entitlement-service')
  const service = new EntitlementService({
    apiUrl: 'https://api.example.com',
    deviceId: 'device-1',
    publicKeys: { 'key-1': publicKey },
    storage,
    fetcher: fetchImpl,
    now: () => now,
    ...(clockTolerance === undefined ? {} : { clockTolerance }),
  })
  return {
    service, storage, token, payload, privateKey,
    getPersisted: () => persisted,
    withSnapshot: async () => { await storage.save({ token }); return service },
  }
}

const networkDown = async () => { throw new Error('fetch failed') }

describe('权益宽限期 · 网络异常时按快照继续授权（design §6.1 行 2/3）', () => {
  it('快照未过期：保持原计划等级，source 标记为宽限态，读通道可用', async () => {
    const f = createFixture({ exp: 400, now: 150, fetcher: networkDown })
    await f.withSnapshot()

    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .resolves.toMatchObject({ plan: 'pro', features: ['cloud_publish'], source: 'grace' })
    expect(f.service.hasFeature('cloud_publish')).toBe(true)
    // 宽限期禁新增付费消耗：写通道（onlineOnly）要求在线态
    expect(f.service.hasFeature('cloud_publish', { onlineOnly: true })).toBe(false)
    expect(f.storage.clear).not.toHaveBeenCalled()
  })

  it('快照已过期但在 72h 宽限期内：继续授权读，带 graceExpiresAt，且仍禁写', async () => {
    const now = 400 + 3600 // 过期 1 小时，远未到 72h
    const f = createFixture({ exp: 400, now, fetcher: networkDown })
    await f.withSnapshot()

    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .resolves.toMatchObject({ plan: 'pro', source: 'grace', graceExpiresAt: 400 + 72 * 3600 })
    expect(f.service.hasFeature('cloud_publish')).toBe(true)
    expect(f.service.hasFeature('cloud_publish', { onlineOnly: true })).toBe(false)
  })

  it('快照过期正好 72h 边界内仍宽限，超过即 fail-closed 降级 free', async () => {
    const inside = createFixture({ exp: 400, now: 400 + 72 * 3600, fetcher: networkDown })
    await inside.withSnapshot()
    await expect(inside.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .resolves.toMatchObject({ source: 'grace' })

    const outside = createFixture({ exp: 400, now: 400 + 72 * 3600 + 1, fetcher: networkDown })
    await outside.withSnapshot()
    await expect(outside.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(outside.service.getState()).toBeNull()
  })

  it('宽限期状态可观测（不是正常在线态）', async () => {
    const f = createFixture({ exp: 400, now: 500, fetcher: networkDown })
    await f.withSnapshot()
    await f.service.sync({ subject: 'sub-1', accessToken: 'access-1' })
    expect(f.service.getState()).toMatchObject({ source: 'grace' })
  })

  it('过期快照的宽限判定不因时钟容差而放宽签名/绑定校验', async () => {
    const f = createFixture({ exp: 400, now: 500, fetcher: networkDown, clockTolerance: 0 })
    await f.withSnapshot()
    // 其他账号的快照不能被拿来宽限授权（绑定校验仍然生效）
    await expect(f.service.sync({ subject: 'sub-other', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.service.getState()).toBeNull()
  })
})

describe('权益宽限期 · 三条 fail-closed 路径保持不变（design §6.2）', () => {
  it('HTTP 401/403：清权并降级 free，不宽限', async () => {
    const f = createFixture({ fetcher: async () => ({ ok: false, status: 401, json: async () => ({}) }) })
    await f.withSnapshot()
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.storage.clear).toHaveBeenCalled()
    expect(f.service.getState()).toBeNull()
  })

  it('响应结构非法（json() 抛异常）：清权，不宽限', async () => {
    const f = createFixture({
      fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }),
    })
    await f.withSnapshot()
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.storage.clear).toHaveBeenCalled()
    expect(f.service.getState()).toBeNull()
  })

  it('账号被停用：清权并抛 ENTITLEMENT_USER_INACTIVE，不宽限', async () => {
    const f = createFixture({
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ user: { status: 'suspended' }, entitlement: { plan: 'pro', features: ['cloud_publish'] } }) }),
    })
    await f.withSnapshot()
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_USER_INACTIVE' })
    expect(f.storage.clear).toHaveBeenCalled()
  })
})

describe('权益宽限期 · 无快照一律 fail-closed（design §6.1 行 1）', () => {
  it('首次安装即断网：降级 free，不白嫖', async () => {
    const f = createFixture({ fetcher: networkDown })
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.service.getState()).toBeNull()
    expect(f.service.hasFeature('cloud_publish')).toBe(false)
  })

  it('快照签名无效：同样不宽限（fail-closed）', async () => {
    const f = createFixture({ fetcher: networkDown })
    await f.storage.save({ token: f.token.slice(0, -4) + 'AAAA' })
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.service.getState()).toBeNull()
  })

  it('无 storage 的构造（只在线态）：网络异常仍然 fail-closed', async () => {
    const { EntitlementService } = require('./entitlement-service')
    const service = new EntitlementService({
      apiUrl: 'https://api.example.com', deviceId: 'device-1', publicKeys: {}, now: () => 150,
      fetcher: async () => { throw new Error('fetch failed') },
    })
    await expect(service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
  })
})

describe('权益宽限期 · 与在线恢复的衔接', () => {
  it('宽限后同步成功即回到 online 态，并刷新签名快照', async () => {
    let down = true
    // 恢复后的响应带一份**未过期**的新快照（过期快照在线路径本就 fail-closed，不在本次改动范围）
    const f = createFixture({ exp: 400, now: 500, fetcher: null })
    const freshToken = sign({ ...f.payload, iat: 480, exp: 500 + 3600 }, f.privateKey)
    f.service._fetcher = async () => {
      if (down) throw new Error('fetch failed')
      return {
        ok: true, status: 200,
        json: async () => ({ user: { status: 'active' }, entitlement: { plan: 'pro', features: ['cloud_publish'] }, entitlementSnapshot: { token: freshToken } }),
      }
    }
    await f.withSnapshot()
    await f.service.sync({ subject: 'sub-1', accessToken: 'access-1' })
    expect(f.service.getState().source).toBe('grace')

    down = false
    await f.service.sync({ subject: 'sub-1', accessToken: 'access-2' })
    expect(f.service.getState()).toMatchObject({ source: 'online' })
    expect(f.service.hasFeature('cloud_publish', { onlineOnly: true })).toBe(true)
    expect(f.getPersisted()).toEqual({ token: freshToken })
  })

  it('clear（登出）后网络异常不得复活权益', async () => {
    const f = createFixture({ exp: 400, now: 500, fetcher: networkDown })
    await f.withSnapshot()
    await f.service.clear()
    await expect(f.service.sync({ subject: 'sub-1', accessToken: 'access-1' }))
      .rejects.toMatchObject({ code: 'ENTITLEMENT_SYNC_FAILED' })
    expect(f.service.getState()).toBeNull()
  })
})