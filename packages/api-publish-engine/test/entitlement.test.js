const assert = require('assert')
const crypto = require('crypto')

async function main() {
  const { signEntitlement, verifyEntitlement } = require('../src/auth/entitlement')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const payload = { sub: 'sub-1', device_id: 'device-1', plan: 'pro', iat: 100, exp: 200, kid: 'key-1' }
  const signed = signEntitlement(payload, privateKey)
  const options = { publicKeys: { 'key-1': publicKey }, subject: 'sub-1', deviceId: 'device-1', now: 150 }
  const sign = (overrides) => signEntitlement({ ...payload, ...overrides }, privateKey)

  assert.deepStrictEqual(verifyEntitlement(signed, options), payload)
  assert.throws(() => verifyEntitlement(signed, { ...options, subject: 'sub-2' }), /ENTITLEMENT_BINDING_INVALID/)
  assert.throws(() => verifyEntitlement(signed, { ...options, now: 201, clockTolerance: 0 }), /ENTITLEMENT_EXPIRED/)

  assert.strictEqual(verifyEntitlement(sign({ iat: 210, exp: 400 }), options).iat, 210)
  assert.throws(() => verifyEntitlement(sign({ iat: 211, exp: 400 }), options), /ENTITLEMENT_EXPIRED/)
  assert.strictEqual(verifyEntitlement(sign({ iat: 0, exp: 91 }), options).exp, 91)
  assert.throws(() => verifyEntitlement(sign({ iat: 0, exp: 90 }), options), /ENTITLEMENT_EXPIRED/)

  assert.throws(() => verifyEntitlement(sign({ iat: 151, exp: 500 }), { ...options, clockTolerance: -1 }), /ENTITLEMENT_EXPIRED/)
  assert.strictEqual(verifyEntitlement(sign({ iat: 210, exp: 500 }), { ...options, clockTolerance: Number.NaN }).iat, 210)
  assert.strictEqual(verifyEntitlement(sign({ iat: 450, exp: 500 }), { ...options, clockTolerance: 300 }).iat, 450)
  assert.throws(() => verifyEntitlement(sign({ iat: 451, exp: 500 }), { ...options, clockTolerance: 301 }), /ENTITLEMENT_EXPIRED/)
  console.log('  ✅ entitlement 非对称签名、绑定、过期和时钟偏差校验')
}

main().catch((error) => {
  console.error(`  ❌ entitlement: ${error.stack || error.message}`)
  process.exitCode = 1
})
