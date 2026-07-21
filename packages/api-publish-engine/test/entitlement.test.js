const assert = require('assert')
const crypto = require('crypto')

async function main() {
  const { signEntitlement, verifyEntitlement } = require('../src/auth/entitlement')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const payload = { sub: 'sub-1', device_id: 'device-1', plan: 'pro', iat: 100, exp: 200, kid: 'key-1' }
  const signed = signEntitlement(payload, privateKey)
  assert.deepStrictEqual(verifyEntitlement(signed, { publicKeys: { 'key-1': publicKey }, subject: 'sub-1', deviceId: 'device-1', now: 150 }), payload)
  assert.throws(() => verifyEntitlement(signed, { publicKeys: { 'key-1': publicKey }, subject: 'sub-2', deviceId: 'device-1', now: 150 }), /ENTITLEMENT_BINDING_INVALID/)
  assert.throws(() => verifyEntitlement(signed, { publicKeys: { 'key-1': publicKey }, subject: 'sub-1', deviceId: 'device-1', now: 201 }), /ENTITLEMENT_EXPIRED/)
  console.log('  ✅ entitlement 非对称签名、绑定和过期校验')
}

main().catch((error) => {
  console.error(`  ❌ entitlement: ${error.stack || error.message}`)
  process.exitCode = 1
})
