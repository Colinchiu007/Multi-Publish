const assert = require('assert')
const crypto = require('crypto')
const { createLogtoJwtVerifier } = require('../src/auth/logto-jwks')

function createToken(privateKey, kid, issuer, audience) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ sub: `subject-${kid}`, iss: issuer, aud: audience, exp: 200 })).toString('base64url')
  const input = `${header}.${claims}`
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

function response(body) {
  return { ok: true, json: async () => body }
}

async function main() {
  const issuer = 'https://id.example.com/oidc'
  const audience = 'https://api.multi-publish.com'
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' }
  const jwt = createToken(privateKey, 'key-1', issuer, audience)

  const calls = []
  const fetcher = async (url) => {
    calls.push(url)
    await new Promise((resolve) => setTimeout(resolve, 10))
    return response(url.endsWith('/.well-known/openid-configuration')
      ? { issuer, jwks_uri: `${issuer}/jwks` }
      : { keys: [publicJwk] })
  }
  const verifier = createLogtoJwtVerifier({ issuer, audience, fetcher, now: () => 100 })
  await Promise.all([verifier.verify(jwt), verifier.verify(jwt), verifier.verify(jwt)])
  assert.strictEqual(calls.filter((url) => url.endsWith('/.well-known/openid-configuration')).length, 1, 'Discovery 并发请求必须单飞')
  assert.strictEqual(calls.filter((url) => url.endsWith('/jwks')).length, 1, 'JWKS 并发请求必须单飞')

  let timeoutSignal
  const timeoutVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    fetchTimeoutMs: 20,
    fetcher: (_url, options) => {
      timeoutSignal = options && options.signal
      return new Promise(() => {})
    },
    now: () => 100,
  })
  await assert.rejects(
    Promise.race([
      timeoutVerifier.verify(jwt),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('测试等待超时'), { code: 'TEST_TIMEOUT' })), 100)),
    ]),
    (error) => error && error.code === 'AUTH_DISCOVERY_UNAVAILABLE',
  )
  assert.strictEqual(timeoutSignal && timeoutSignal.aborted, true, '超时后必须中止底层 fetch')

  let jwksCalls = 0
  const negativeVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    unknownKidCacheTtlMs: 1000,
    fetcher: async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) return response({ issuer, jwks_uri: `${issuer}/jwks` })
      jwksCalls += 1
      return response({ keys: [publicJwk] })
    },
    now: () => 100,
  })
  await negativeVerifier.verify(jwt)
  const unknownToken = createToken(privateKey, 'unknown-key', issuer, audience)
  await assert.rejects(negativeVerifier.verify(unknownToken), (error) => error && error.code === 'AUTH_KEY_NOT_FOUND')
  assert.strictEqual(jwksCalls, 2, '首次未知 kid 应强制刷新一次 JWKS')
  await assert.rejects(negativeVerifier.verify(unknownToken), (error) => error && error.code === 'AUTH_KEY_NOT_FOUND')
  assert.strictEqual(jwksCalls, 2, '负缓存有效期内不能重复刷新 JWKS')

  const restrictedUseVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    fetcher: async (url) => response(url.endsWith('/.well-known/openid-configuration')
      ? { issuer, jwks_uri: `${issuer}/jwks` }
      : { keys: [
        { ...publicJwk, kid: 'enc-key', use: 'enc' },
        { ...publicJwk, kid: 'encrypt-key', use: 'sig', key_ops: ['encrypt'] },
        { ...publicJwk, kid: 'verify-key', use: 'sig', key_ops: ['verify'] },
      ] }),
    now: () => 100,
  })
  await assert.doesNotReject(restrictedUseVerifier.verify(createToken(privateKey, 'verify-key', issuer, audience)))
  await assert.rejects(
    restrictedUseVerifier.verify(createToken(privateKey, 'enc-key', issuer, audience)),
    (error) => error && error.code === 'AUTH_KEY_NOT_FOUND',
  )
  await assert.rejects(
    restrictedUseVerifier.verify(createToken(privateKey, 'encrypt-key', issuer, audience)),
    (error) => error && error.code === 'AUTH_KEY_NOT_FOUND',
  )

  const rotatedPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const rotatedJwk = { ...rotatedPair.publicKey.export({ format: 'jwk' }), kid: 'key-2', alg: 'RS256', use: 'sig' }
  let rotated = false
  let rotationJwksCalls = 0
  const rotationVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    fetcher: async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) return response({ issuer, jwks_uri: `${issuer}/jwks` })
      rotationJwksCalls += 1
      return response({ keys: rotated ? [rotatedJwk] : [publicJwk] })
    },
    now: () => 100,
  })
  await rotationVerifier.verify(jwt)
  rotated = true
  const rotatedToken = createToken(rotatedPair.privateKey, 'key-2', issuer, audience)
  await assert.doesNotReject(rotationVerifier.verify(rotatedToken))
  assert.strictEqual(rotationJwksCalls, 2, '未知 kid 应主动刷新并接受轮换后的新公钥')

  let uniqueRefreshes = 0
  const boundedVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    unknownKidCacheTtlMs: 1000,
    forcedRefreshCooldownMs: 1000,
    unknownKidCacheMax: 32,
    fetcher: async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) return response({ issuer, jwks_uri: `${issuer}/jwks` })
      uniqueRefreshes += 1
      return response({ keys: [publicJwk] })
    },
    clockMs: () => 100000,
    now: () => 100,
  })
  await assert.rejects(boundedVerifier.verify(createToken(privateKey, 'seed', issuer, audience)))
  for (let index = 0; index < 1000; index += 1) {
    await assert.rejects(
      boundedVerifier.verify(createToken(privateKey, `random-${index}`, issuer, audience)),
      (error) => error && error.code === 'AUTH_KEY_NOT_FOUND',
    )
  }
  assert(uniqueRefreshes <= 2, '唯一 kid 洪泛不能为每个请求刷新 JWKS')
  assert(boundedVerifier._unknownKidCache.size <= 32, '未知 kid 负缓存必须有界')
  await assert.rejects(
    boundedVerifier.verify(createToken(privateKey, 'x'.repeat(129), issuer, audience)),
    (error) => error && error.code === 'AUTH_KEY_NOT_FOUND',
  )

  console.log('  ✅ Logto JWKS 超时、单飞与未知 kid 负缓存')
}

main().catch((error) => {
  console.error(`  ❌ Logto JWKS hardening: ${error.stack || error.message}`)
  process.exitCode = 1
})
