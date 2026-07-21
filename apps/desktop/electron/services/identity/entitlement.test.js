const crypto = require('crypto')

function createSignedToken(overrides = {}) {
  const now = 1_700_000_000
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const snapshot = {
    sub: 'sub-1',
    device_id: 'device-1',
    plan: 'pro',
    features: ['cloud_publish'],
    iat: now - 10,
    exp: now + 3600,
    kid: 'key-1',
    ...overrides,
  }
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url')
  const signature = crypto.sign('RSA-SHA256', Buffer.from(payload), privateKey)
    .toString('base64url')
  return { now, payload, publicKey, snapshot, token: `${payload}.${signature}` }
}

describe('verifyEntitlementSnapshot', () => {
  it('接受绑定 sub/device 且在有效期内的快照', () => {
    const { verifyEntitlementSnapshot } = require('./entitlement')
    const now = 1_700_000_000
    const snapshot = {
      sub: 'sub-1', device_id: 'device-1', plan: 'pro', features: ['cloud_publish'],
      iat: now - 10, exp: now + 3600, kid: 'key-1',
    }
    expect(verifyEntitlementSnapshot(snapshot, {
      subject: 'sub-1', deviceId: 'device-1', now, verify: () => true,
    })).toEqual(snapshot)
  })

  it.each([
    ['subject', { subject: 'sub-2', deviceId: 'device-1' }],
    ['device', { subject: 'sub-1', deviceId: 'device-2' }],
  ])('拒绝错误 %s 绑定', (_name, identity) => {
    const { verifyEntitlementSnapshot } = require('./entitlement')
    const snapshot = { sub: 'sub-1', device_id: 'device-1', iat: 10, exp: 100, kid: 'key-1' }
    expect(() => verifyEntitlementSnapshot(snapshot, { ...identity, now: 50, verify: () => true }))
      .toThrow(/ENTITLEMENT_BINDING_INVALID/)
  })

  it('拒绝过期、签名失败和缺少 kid 的快照', () => {
    const { verifyEntitlementSnapshot } = require('./entitlement')
    const base = { sub: 'sub-1', device_id: 'device-1', iat: 10, exp: 20, kid: 'key-1' }
    expect(() => verifyEntitlementSnapshot(base, { subject: 'sub-1', deviceId: 'device-1', now: 21, verify: () => true }))
      .toThrow(/ENTITLEMENT_EXPIRED/)
    expect(() => verifyEntitlementSnapshot({ ...base, exp: 100 }, { subject: 'sub-1', deviceId: 'device-1', now: 21, verify: () => false }))
      .toThrow(/ENTITLEMENT_SIGNATURE_INVALID/)
    expect(() => verifyEntitlementSnapshot({ ...base, kid: '' }, { subject: 'sub-1', deviceId: 'device-1', now: 21, verify: () => true }))
      .toThrow(/ENTITLEMENT_KEY_INVALID/)
  })

  it('拒绝无效入参、未来签发时间和验签异常', () => {
    const { verifyEntitlementSnapshot } = require('./entitlement')
    const base = { sub: 'sub-1', device_id: 'device-1', iat: 10, exp: 100, kid: 'key-1' }

    expect(() => verifyEntitlementSnapshot(null, {})).toThrow(/ENTITLEMENT_INVALID/)
    expect(() => verifyEntitlementSnapshot(base, null)).toThrow(/ENTITLEMENT_INVALID/)
    expect(() => verifyEntitlementSnapshot({ ...base, iat: 51 }, {
      subject: 'sub-1', deviceId: 'device-1', now: 50, verify: () => true,
    })).toThrow(/ENTITLEMENT_EXPIRED/)
    expect(() => verifyEntitlementSnapshot(base, {
      subject: 'sub-1', deviceId: 'device-1', now: 50,
      verify: () => { throw new Error('验签器异常') },
    })).toThrow(/ENTITLEMENT_SIGNATURE_INVALID/)
  })
})

describe('verifyEntitlementToken', () => {
  it('使用 kid 对应的真实 RSA 公钥验证签名', () => {
    const { verifyEntitlementToken } = require('./entitlement')
    const { now, publicKey, snapshot, token } = createSignedToken()

    expect(verifyEntitlementToken(token, {
      subject: 'sub-1',
      deviceId: 'device-1',
      now,
      publicKeys: { 'key-1': publicKey },
    })).toEqual(snapshot)
  })

  it('拒绝篡改签名和未知 kid', () => {
    const { verifyEntitlementToken } = require('./entitlement')
    const { now, publicKey, token } = createSignedToken()
    const [payload, signature] = token.split('.')
    const tamperedBytes = Buffer.from(signature, 'base64url')
    tamperedBytes[0] ^= 0x01
    const tamperedSignature = tamperedBytes.toString('base64url')
    const options = {
      subject: 'sub-1', deviceId: 'device-1', now, publicKeys: { 'key-1': publicKey },
    }

    expect(() => verifyEntitlementToken(`${payload}.${tamperedSignature}`, options))
      .toThrow(/ENTITLEMENT_SIGNATURE_INVALID/)
    expect(() => verifyEntitlementToken(token, { ...options, publicKeys: {} }))
      .toThrow(/ENTITLEMENT_KEY_INVALID/)
  })

  it.each([
    [null],
    ['missing-signature'],
    ['@@@.signature'],
    ['x'.repeat(64 * 1024 + 1)],
  ])('拒绝畸形或超长 token：%p', (token) => {
    const { verifyEntitlementToken } = require('./entitlement')
    expect(() => verifyEntitlementToken(token, {})).toThrow(/ENTITLEMENT_INVALID/)
  })
})
