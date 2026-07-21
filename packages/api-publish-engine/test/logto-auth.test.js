const assert = require('assert')
const crypto = require('crypto')

const { verifyJwtClaims, requireScopes, parseBearerToken } = require('../src/auth/logto-auth')

function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`) } catch (error) { console.error(`  ❌ ${name}: ${error.message}`); process.exitCode = 1 }
}

function signToken(privateKey, claims, headerValue = { alg: 'RS256', typ: 'JWT' }) {
  const header = Buffer.from(JSON.stringify(headerValue)).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')
  return `${input}.${signature}`
}

console.log('--- Logto JWT claims ---')

test('解析 Bearer token 并拒绝缺失 header', () => {
  assert.strictEqual(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.throws(() => parseBearerToken('Basic abc'), /AUTH_TOKEN_MISSING/)
  assert.throws(() => parseBearerToken(''), /AUTH_TOKEN_MISSING/)
})

test('验证 issuer、audience、时间和签名算法', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'sub-1', iss: 'https://logto.example/oidc', aud: 'https://api.multi-publish.com', scope: 'publish:read', iat: 100, exp: 200 })).toString('base64url')
  const input = `${header}.${payload}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')
  const token = `${input}.${signature}`
  assert.deepStrictEqual(verifyJwtClaims(token, { publicKey, issuer: 'https://logto.example/oidc', audience: 'https://api.multi-publish.com', now: 150 }), { subject: 'sub-1', scopes: ['publish:read'] })
  assert.throws(() => verifyJwtClaims(token, { publicKey, issuer: 'https://other.example', audience: 'https://api.multi-publish.com', now: 150 }), /AUTH_ISSUER_INVALID/)
  assert.throws(() => verifyJwtClaims(token, { publicKey, issuer: 'https://logto.example/oidc', audience: 'https://api.multi-publish.com', now: 261 }), /AUTH_TOKEN_EXPIRED/)
})

test('scope 不足返回 AUTH_SCOPE_MISSING', () => {
  assert.throws(() => requireScopes({ scopes: ['publish:read'] }, ['publish:submit']), /AUTH_SCOPE_MISSING/)
  assert.strictEqual(requireScopes({ scopes: ['publish:read', 'publish:submit'] }, ['publish:submit']), true)
})

test('异常 scope 类型在 Node 中不能被当成权限字符串', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const token = signToken(privateKey, {
    sub: 'sub-1', iss: 'issuer', aud: 'audience', scope: 123, exp: 300,
  })
  const auth = verifyJwtClaims(token, { publicKey, issuer: 'issuer', audience: 'audience', now: 200 })
  assert.deepStrictEqual(auth.scopes, [])
  assert.throws(() => requireScopes(auth, ['123']), /AUTH_SCOPE_MISSING/)
})

test('JWT header 和 payload 必须是 JSON 对象', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const token = signToken(privateKey, ['not-an-object'])
  assert.throws(
    () => verifyJwtClaims(token, { publicKey, issuer: 'issuer', audience: 'audience', now: 200 }),
    /AUTH_TOKEN_INVALID/,
  )
})

test('拒绝错误 audience、未来 nbf、算法降级和错误签名', () => {
  const first = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const second = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const claims = { sub: 'sub-1', iss: 'issuer', aud: 'audience', scope: [], exp: 300 }
  const valid = signToken(first.privateKey, claims)
  assert.throws(() => verifyJwtClaims(valid, { publicKey: first.publicKey, issuer: 'issuer', audience: 'other', now: 200 }), /AUTH_AUDIENCE_INVALID/)
  assert.throws(() => verifyJwtClaims(signToken(first.privateKey, { ...claims, nbf: 261 }), { publicKey: first.publicKey, issuer: 'issuer', audience: 'audience', now: 200 }), /AUTH_TOKEN_NOT_ACTIVE/)
  assert.throws(() => verifyJwtClaims(signToken(first.privateKey, { ...claims, nbf: '201' }), { publicKey: first.publicKey, issuer: 'issuer', audience: 'audience', now: 200 }), /AUTH_TOKEN_NOT_ACTIVE/)
  assert.throws(() => verifyJwtClaims(signToken(first.privateKey, { ...claims, nbf: null }), { publicKey: first.publicKey, issuer: 'issuer', audience: 'audience', now: 200 }), /AUTH_TOKEN_NOT_ACTIVE/)
  assert.throws(() => verifyJwtClaims(signToken(first.privateKey, claims, { alg: 'none' }), { publicKey: first.publicKey, issuer: 'issuer', audience: 'audience', now: 200 }), /AUTH_ALGORITHM_INVALID/)
  assert.throws(() => verifyJwtClaims(valid, { publicKey: second.publicKey, issuer: 'issuer', audience: 'audience', now: 200 }), /AUTH_SIGNATURE_INVALID/)
})
