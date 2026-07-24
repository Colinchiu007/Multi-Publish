const assert = require('assert')
const crypto = require('crypto')

function token(privateKey, kid, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

function ecToken(privateKey, kid, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES384', typ: 'JWT', kid })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  const signature = crypto.sign('sha384', Buffer.from(input), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')
  return `${input}.${signature}`
}

async function main() {
  const { createLogtoJwtVerifier, createLogtoAuthMiddleware } = require('../src/auth/logto-jwks')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const issuer = 'https://id.example.com/oidc'
  const audience = 'https://api.multi-publish.com'
  const jwk = publicKey.export({ format: 'jwk' })
  const calls = []
  const fetcher = async (url) => {
    calls.push(url)
    if (url.endsWith('/.well-known/openid-configuration')) return { ok: true, json: async () => ({ issuer, jwks_uri: `${issuer}/jwks` }) }
    return { ok: true, json: async () => ({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }) }
  }
  const verifier = createLogtoJwtVerifier({ issuer, audience, fetcher, now: () => 150 })
  const jwt = token(privateKey, 'key-1', { sub: 'sub-1', iss: issuer, aud: audience, scope: 'publish:read publish:submit', iat: 100, exp: 200 })
  assert.deepStrictEqual(await verifier.verify(jwt), { subject: 'sub-1', scopes: ['publish:read', 'publish:submit'] })
  assert.strictEqual(calls.length, 2)
  assert.deepStrictEqual(await verifier.verify(jwt), { subject: 'sub-1', scopes: ['publish:read', 'publish:submit'] })
  assert.strictEqual(calls.length, 2, '有效 JWKS 应命中缓存')
  assert.deepStrictEqual(await verifier.checkReady(), { oidc: 'ready', jwks: 'ready', signingKeys: 1 })
  assert.strictEqual(calls.length, 2, 'readiness 应复用已验证的 discovery/JWKS 缓存')

  const middleware = createLogtoAuthMiddleware({ verifier, requiredScopes: ['publish:submit'] })
  const req = { headers: { authorization: `Bearer ${jwt}` } }
  let nextCalled = false
  await middleware(req, { writeHead: () => {}, end: () => {} }, () => { nextCalled = true })
  assert.strictEqual(nextCalled, true)
  assert.strictEqual(req.auth.subject, 'sub-1')

  const denied = createLogtoAuthMiddleware({ verifier, requiredScopes: ['admin:users'] })
  const response = { status: null, body: '', writeHead(status) { this.status = status }, end(body) { this.body = body } }
  await denied({ headers: { authorization: `Bearer ${jwt}` } }, response, () => {})
  assert.strictEqual(response.status, 403)
  assert.match(response.body, /AUTH_SCOPE_MISSING/)

  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const ecJwk = ec.publicKey.export({ format: 'jwk' })
  const ecFetcher = async (url) => ({
    ok: true,
    json: async () => url.endsWith('/.well-known/openid-configuration')
      ? { issuer, jwks_uri: `${issuer}/jwks` }
      : { keys: [{ ...ecJwk, kid: 'ec-key-1', alg: 'ES384', use: 'sig' }] },
  })
  const ecVerifier = createLogtoJwtVerifier({ issuer, audience, fetcher: ecFetcher, now: () => 150 })
  const ecJwt = ecToken(ec.privateKey, 'ec-key-1', {
    sub: 'sub-ec', iss: issuer, aud: audience, scope: 'publish:read', iat: 100, exp: 200,
  })
  assert.deepStrictEqual(await ecVerifier.verify(ecJwt), { subject: 'sub-ec', scopes: ['publish:read'] })
  assert.deepStrictEqual(await ecVerifier.checkReady(), { oidc: 'ready', jwks: 'ready', signingKeys: 1 })

  const wrongCurve = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const wrongCurveJwk = wrongCurve.publicKey.export({ format: 'jwk' })
  const wrongCurveVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    fetcher: async (url) => ({
      ok: true,
      json: async () => url.endsWith('/.well-known/openid-configuration')
        ? { issuer, jwks_uri: `${issuer}/jwks` }
        : { keys: [{ ...wrongCurveJwk, kid: 'wrong-curve', alg: 'ES384', use: 'sig' }] },
    }),
  })
  await assert.rejects(wrongCurveVerifier.checkReady(), (error) => error && error.code === 'AUTH_JWKS_INVALID')

  const mismatchedProfileVerifier = createLogtoJwtVerifier({
    issuer,
    audience,
    fetcher: async (url) => ({
      ok: true,
      json: async () => url.endsWith('/.well-known/openid-configuration')
        ? { issuer, jwks_uri: `${issuer}/jwks` }
        : { keys: [{ ...jwk, kid: 'rsa-as-es384', alg: 'ES384', use: 'sig' }] },
    }),
  })
  await assert.rejects(
    mismatchedProfileVerifier.checkReady(),
    (error) => error && error.code === 'AUTH_JWKS_INVALID',
  )
  console.log('  ✅ Logto JWKS 缓存、验签和 scope middleware')
}

main().catch((error) => {
  console.error(`  ❌ Logto JWKS: ${error.stack || error.message}`)
  process.exitCode = 1
})
