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

  // ===== Opaque Token Introspection 回归测试 =====
  // 回归保护：Bug "登录暂时不可用，请稍后重试"
  // 根因：Logto 默认签发 Opaque Token，但 LogtoJwtVerifier.verify 假设 token 为 JWT
  // 修复：未配置 client credentials 时仍抛 AUTH_TOKEN_INVALID；配置后调用 introspection 端点

  // 1) 未配置 clientId/clientSecret 时，Opaque Token 仍被拒绝（向后兼容）
  const noIntrospectionVerifier = createLogtoJwtVerifier({
    issuer, audience,
    fetcher: async (url) => ({
      ok: true,
      json: async () => url.endsWith('/.well-known/openid-configuration')
        ? { issuer, jwks_uri: `${issuer}/jwks` }
        : { keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] },
    }),
    now: () => 150,
  })
  await assert.rejects(
    noIntrospectionVerifier.verify('opaque-token-no-jwt'),
    (error) => error && error.code === 'AUTH_TOKEN_INVALID',
  )
  console.log('  ✅ 未配置 client credentials 时 Opaque Token 被拒绝（向后兼容）')

  // 2) 配置 client credentials 后，Opaque Token 通过 introspection 端点验证成功
  const introspectionCalls = []
  const introspectionFetcher = async (url, options) => {
    if (url.endsWith('/.well-known/openid-configuration')) {
      return { ok: true, json: async () => ({ issuer, jwks_uri: `${issuer}/jwks`, introspection_endpoint: `${issuer}/token/introspection` }) }
    }
    if (url.endsWith('/token/introspection')) {
      introspectionCalls.push({ url, options })
      const body = typeof options.body === 'string' ? options.body : ''
      const tokenMatch = body.match(/token=([^&]+)/)
      const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : ''
      if (token === 'opaque-active-token') {
        return {
          ok: true,
          json: async () => ({
            active: true,
            sub: 'sub-opaque',
            scope: 'profile:read publish:submit',
            aud: audience,
            iss: issuer,
            exp: 250,
          }),
        }
      }
      if (token === 'opaque.active.token') {
        return {
          ok: true,
          json: async () => ({
            active: true,
            sub: 'sub-dotted-opaque',
            scope: 'profile:read',
            aud: audience,
            iss: issuer,
            exp: 250,
          }),
        }
      }
      if (token === 'e30.active.token') {
        return {
          ok: true,
          json: async () => ({
            active: true,
            sub: 'sub-json-prefix-opaque',
            scope: 'profile:read',
            aud: audience,
            iss: issuer,
            exp: 250,
          }),
        }
      }
      if (token === 'opaque-inactive-token') {
        return { ok: true, json: async () => ({ active: false }) }
      }
      if (token === 'opaque-expired-token') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-expired', scope: 'profile:read', aud: audience, iss: issuer, exp: 89,
          }),
        }
      }
      if (token === 'opaque-tolerated-expiry') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-tolerated-expiry', scope: 'profile:read', aud: audience, iss: issuer, exp: 100,
          }),
        }
      }
      if (token === 'opaque-future-nbf') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-future', scope: 'profile:read', aud: audience, iss: issuer, nbf: 211, exp: 250,
          }),
        }
      }
      if (token === 'opaque-tolerated-nbf') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-tolerated-nbf', scope: 'profile:read', aud: audience, iss: issuer, nbf: 200, exp: 250,
          }),
        }
      }
      if (token === 'opaque-invalid-nbf') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-invalid-nbf', scope: 'profile:read', aud: audience, iss: issuer, nbf: 'later', exp: 250,
          }),
        }
      }
      if (token === 'opaque-wrong-audience') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-aud', scope: 'profile:read', aud: 'https://other.example.com', iss: issuer, exp: 250,
          }),
        }
      }
      if (token === 'opaque-wrong-issuer') {
        return {
          ok: true,
          json: async () => ({
            active: true, sub: 'sub-iss', scope: 'profile:read', aud: audience, iss: 'https://other.example.com', exp: 250,
          }),
        }
      }
      if (token === 'opaque-missing-audience') {
        return { ok: true, json: async () => ({ active: true, sub: 'sub-no-aud', scope: 'profile:read' }) }
      }
      if (token === 'opaque-missing-subject') {
        return { ok: true, json: async () => ({ active: true, aud: audience, scope: 'profile:read' }) }
      }
      if (token === 'opaque-invalid-subject') {
        return { ok: true, json: async () => ({ active: true, sub: 42, aud: audience, scope: 'profile:read' }) }
      }
      if (token === 'opaque-audience-array') {
        return {
          ok: true,
          json: async () => ({ active: true, sub: 'sub-aud-array', aud: ['https://other.example.com', audience] }),
        }
      }
      if (token === 'opaque-invalid-expiry') {
        return { ok: true, json: async () => ({ active: true, sub: 'sub-bad-exp', aud: audience, exp: 'later' }) }
      }
      if (token === 'opaque-empty-issuer') {
        return { ok: true, json: async () => ({ active: true, sub: 'sub-empty-iss', aud: audience, iss: '' }) }
      }
      if (token === 'opaque-without-optional-claims') {
        return { ok: true, json: async () => ({ active: true, sub: 'sub-optional', aud: audience, scope: ['profile:read'] }) }
      }
      return { ok: true, json: async () => ({ active: false }) }
    }
    return { ok: true, json: async () => ({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }) }
  }
  let currentClockMs = 150000
  const introspectionVerifier = createLogtoJwtVerifier({
    issuer, audience,
    clientId: 'm2m-client-id',
    clientSecret: 'm2m-client-secret',
    fetcher: introspectionFetcher,
    now: () => 150,
    clockMs: () => currentClockMs,
    introspectionCacheTtlMs: 1000,
  })
  const introspectionResult = await introspectionVerifier.verify('opaque-active-token')
  assert.deepStrictEqual(introspectionResult, {
    subject: 'sub-opaque',
    scopes: ['profile:read', 'publish:submit'],
  })
  assert.strictEqual(introspectionCalls.length, 1, 'introspection 应该被调用一次')
  // 验证 Basic Auth header
  const introspectionOptions = introspectionCalls[0].options
  const authHeader = introspectionOptions.headers.Authorization
  assert.strictEqual(introspectionOptions.redirect, 'error', 'introspection 不得跟随重定向')
  assert.ok(authHeader.startsWith('Basic '), '应使用 Basic Auth')
  const decodedCredentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
  assert.strictEqual(decodedCredentials, 'm2m-client-id:m2m-client-secret', 'client credentials 应正确编码')
  // 验证 body 包含 token
  assert.ok(introspectionOptions.body.includes('token=opaque-active-token'), '应包含 token')
  assert.ok(introspectionOptions.body.includes('token_type_hint=access_token'), '应包含 token_type_hint')
  console.log('  ✅ Opaque Token 通过 introspection 端点验证成功')

  // 3) 第二次验证同一 token 应命中缓存（不重复调用 introspection）
  const cachedResult = await introspectionVerifier.verify('opaque-active-token')
  assert.deepStrictEqual(cachedResult, { subject: 'sub-opaque', scopes: ['profile:read', 'publish:submit'] })
  assert.strictEqual(introspectionCalls.length, 1, 'introspection 应命中缓存不重复调用')
  assert.strictEqual(introspectionVerifier._introspectionCache.has('opaque-active-token'), false,
    '缓存键不得保留 Bearer Token 原文')
  assert([...introspectionVerifier._introspectionCache.keys()].every((key) => /^[A-Za-z0-9_-]{43}$/.test(key)),
    '缓存键必须使用固定长度的 SHA-256 指纹')
  console.log('  ✅ Opaque Token introspection 结果缓存生效')

  // 缓存 TTL 到期后必须重新 introspection，不能永久复用旧授权结果。
  currentClockMs += 1001
  const refreshedResult = await introspectionVerifier.verify('opaque-active-token')
  assert.deepStrictEqual(refreshedResult, { subject: 'sub-opaque', scopes: ['profile:read', 'publish:submit'] })
  assert.strictEqual(introspectionCalls.length, 2, '缓存 TTL 到期后必须重新调用 introspection')
  console.log('  ✅ Opaque Token 缓存到期后重新 introspection')

  // Opaque Token 的语法不受 JWT 三段格式约束；带两个点也必须走 introspection。
  const callsBeforeDottedOpaque = introspectionCalls.length
  assert.deepStrictEqual(
    await introspectionVerifier.verify('opaque.active.token'),
    { subject: 'sub-dotted-opaque', scopes: ['profile:read'] },
  )
  assert.strictEqual(introspectionCalls.length, callsBeforeDottedOpaque + 1,
    '带点 Opaque Token 必须调用 introspection，不能误判为 JWT')
  assert.deepStrictEqual(
    await introspectionVerifier.verify('e30.active.token'),
    { subject: 'sub-json-prefix-opaque', scopes: ['profile:read'] },
    '仅能解码为 JSON 对象但没有 alg 的首段不是 JOSE header',
  )
  console.log('  ✅ 带点 Opaque Token 不会被误判为 JWT')

  // 4) introspection 返回 active=false 时拒绝
  await assert.rejects(
    introspectionVerifier.verify('opaque-inactive-token'),
    (error) => error && error.code === 'AUTH_TOKEN_INVALID',
  )
  console.log('  ✅ introspection 返回 active=false 时正确拒绝')

  // 5) introspection 返回的 aud 不匹配时拒绝
  await assert.rejects(
    introspectionVerifier.verify('opaque-wrong-audience'),
    (error) => error && error.code === 'AUTH_AUDIENCE_INVALID',
  )
  console.log('  ✅ introspection 返回 aud 不匹配时正确拒绝')

  // 6) introspection 返回的 iss 不匹配时拒绝
  await assert.rejects(
    introspectionVerifier.verify('opaque-wrong-issuer'),
    (error) => error && error.code === 'AUTH_ISSUER_INVALID',
  )
  console.log('  ✅ introspection 返回 iss 不匹配时正确拒绝')

  // 7) introspection 返回的 token 已过期时拒绝
  await assert.rejects(
    introspectionVerifier.verify('opaque-expired-token'),
    (error) => error && error.code === 'AUTH_TOKEN_EXPIRED',
  )
  assert.deepStrictEqual(
    await introspectionVerifier.verify('opaque-tolerated-expiry'),
    { subject: 'sub-tolerated-expiry', scopes: ['profile:read'] },
  )
  console.log('  ✅ introspection 返回的 token 已过期时正确拒绝')

  await assert.rejects(
    introspectionVerifier.verify('opaque-future-nbf'),
    (error) => error && error.code === 'AUTH_TOKEN_NOT_ACTIVE',
  )
  await assert.rejects(
    introspectionVerifier.verify('opaque-invalid-nbf'),
    (error) => error && error.code === 'AUTH_TOKEN_NOT_ACTIVE',
  )
  assert.deepStrictEqual(
    await introspectionVerifier.verify('opaque-tolerated-nbf'),
    { subject: 'sub-tolerated-nbf', scopes: ['profile:read'] },
  )
  console.log('  ✅ introspection 返回未来或非法 nbf 时正确拒绝')

  // 8) aud/sub 必填；iss/exp 可省略，但一旦出现必须合法
  await assert.rejects(
    introspectionVerifier.verify('opaque-missing-audience'),
    (error) => error && error.code === 'AUTH_AUDIENCE_INVALID',
  )
  await assert.rejects(
    introspectionVerifier.verify('opaque-missing-subject'),
    (error) => error && error.code === 'AUTH_SUBJECT_INVALID',
  )
  await assert.rejects(
    introspectionVerifier.verify('opaque-invalid-subject'),
    (error) => error && error.code === 'AUTH_SUBJECT_INVALID',
  )
  await assert.rejects(
    introspectionVerifier.verify('opaque-invalid-expiry'),
    (error) => error && error.code === 'AUTH_TOKEN_INVALID',
  )
  await assert.rejects(
    introspectionVerifier.verify('opaque-empty-issuer'),
    (error) => error && error.code === 'AUTH_ISSUER_INVALID',
  )
  assert.deepStrictEqual(
    await introspectionVerifier.verify('opaque-without-optional-claims'),
    { subject: 'sub-optional', scopes: ['profile:read'] },
  )
  assert.deepStrictEqual(
    await introspectionVerifier.verify('opaque-audience-array'),
    { subject: 'sub-aud-array', scopes: [] },
  )
  console.log('  ✅ Opaque Token introspection claims 合同完整')

  // 9) JWT token 仍然走原 JWKS 验证流程（向后兼容）
  const jwtStillWorks = await introspectionVerifier.verify(jwt)
  assert.deepStrictEqual(jwtStillWorks, { subject: 'sub-1', scopes: ['publish:read', 'publish:submit'] })
  const introspectionCallsBeforeInvalidJwt = introspectionCalls.length
  const jwtParts = jwt.split('.')
  const invalidJwt = `${jwtParts[0]}.${jwtParts[1]}.${'A'.repeat(jwtParts[2].length)}`
  await assert.rejects(
    introspectionVerifier.verify(invalidJwt),
    (error) => error && error.code === 'AUTH_SIGNATURE_INVALID',
  )
  assert.strictEqual(introspectionCalls.length, introspectionCallsBeforeInvalidJwt,
    'JWT 验签失败后不得降级到 introspection')
  console.log('  ✅ JWT Token 仍走原 JWKS 验证流程（向后兼容）')

  // 10) readiness 必须验证 introspection endpoint 和 M2M 凭据
  const callsBeforeReadiness = introspectionCalls.length
  assert.deepStrictEqual(await introspectionVerifier.checkReady(), {
    oidc: 'ready', jwks: 'ready', introspection: 'ready', signingKeys: 1,
  })
  assert.strictEqual(introspectionCalls.length, callsBeforeReadiness + 1,
    'readiness 必须真实调用 introspection endpoint')
  assert.match(introspectionCalls.at(-1).options.body, /^token=multi-publish-readiness-[A-Za-z0-9_-]+&/,
    'readiness 必须使用随机无效探针，不得复用用户 Token')
  console.log('  ✅ readiness 真实验证 introspection endpoint 和 M2M 凭据')

  // 11) introspection 端点不可用时抛 AUTH_INTROSPECTION_UNAVAILABLE
  const unavailableVerifier = createLogtoJwtVerifier({
    issuer, audience,
    clientId: 'm2m-client-id',
    clientSecret: 'm2m-client-secret',
    fetcher: async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ issuer, jwks_uri: `${issuer}/jwks`, introspection_endpoint: `${issuer}/token/introspection` }) }
      }
      if (url.endsWith('/token/introspection')) return { ok: false, status: 500 }
      return { ok: true, json: async () => ({ keys: [] }) }
    },
    now: () => 150,
  })
  await assert.rejects(
    unavailableVerifier.verify('opaque-token-when-introspection-down'),
    (error) => error && error.code === 'AUTH_INTROSPECTION_UNAVAILABLE',
  )
  console.log('  ✅ introspection 端点不可用时正确抛 AUTH_INTROSPECTION_UNAVAILABLE')

  // 12) discovery 不得把 M2M Secret 发送到不可信 introspection endpoint
  for (const introspectionEndpoint of [
    'http://id.example.com/oidc/token/introspection',
    'https://evil.example.com/token/introspection',
    'https://user:password@id.example.com/oidc/token/introspection',
  ]) {
    const endpointCalls = []
    const endpointVerifier = createLogtoJwtVerifier({
      issuer, audience,
      clientId: 'm2m-client-id',
      clientSecret: 'm2m-client-secret',
      fetcher: async (url, options) => {
        endpointCalls.push({ url, options })
        return {
          ok: true,
          json: async () => ({ issuer, jwks_uri: `${issuer}/jwks`, introspection_endpoint: introspectionEndpoint }),
        }
      },
    })
    await assert.rejects(
      endpointVerifier.verify('opaque-endpoint-probe'),
      (error) => error && error.code === 'AUTH_INTROSPECTION_URL_INVALID',
    )
    assert.strictEqual(endpointCalls.length, 1, '不可信 endpoint 只能触发 discovery 请求')
    assert.strictEqual(endpointCalls[0].options?.redirect, 'error', 'discovery 不得跟随重定向')
    assert.strictEqual(endpointCalls[0].options?.headers?.Authorization, undefined,
      'M2M Authorization 不得发送到 discovery 请求')
  }
  console.log('  ✅ 不可信 introspection endpoint 在发送 M2M Secret 前被拒绝')

  // 13) 同一 Opaque Token 的并发验证必须合并为一次 introspection
  let concurrentIntrospectionCalls = 0
  const concurrentVerifier = createLogtoJwtVerifier({
    issuer, audience,
    clientId: 'm2m-client-id',
    clientSecret: 'm2m-client-secret',
    fetcher: async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({
          issuer, jwks_uri: `${issuer}/jwks`, introspection_endpoint: `${issuer}/token/introspection`,
        }) }
      }
      if (url.endsWith('/token/introspection')) {
        concurrentIntrospectionCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { ok: true, json: async () => ({ active: true, sub: 'sub-concurrent', aud: audience }) }
      }
      return { ok: true, json: async () => ({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }) }
    },
  })
  assert.deepStrictEqual(
    await Promise.all([
      concurrentVerifier.verify('opaque-concurrent-token'),
      concurrentVerifier.verify('opaque-concurrent-token'),
    ]),
    [
      { subject: 'sub-concurrent', scopes: [] },
      { subject: 'sub-concurrent', scopes: [] },
    ],
  )
  assert.strictEqual(concurrentIntrospectionCalls, 1, '并发请求不得重复调用 introspection endpoint')
  assert.strictEqual(concurrentVerifier._introspectionInFlight.size, 0, '完成后必须释放 in-flight 状态')
  console.log('  ✅ Opaque Token 并发 introspection 已合并')

  // 14) auth middleware 将身份依赖故障映射为 503
  const unavailableMiddleware = createLogtoAuthMiddleware({
    verifier: {
      verify: async () => {
        throw Object.assign(new Error('upstream down'), { code: 'AUTH_INTROSPECTION_UNAVAILABLE' })
      },
    },
  })
  const unavailableResponse = {
    status: null,
    body: '',
    writeHead(status) { this.status = status },
    end(body) { this.body = body },
  }
  await unavailableMiddleware(
    { headers: { authorization: 'Bearer opaque-middleware-token' } },
    unavailableResponse,
    () => {},
  )
  assert.strictEqual(unavailableResponse.status, 503)
  assert.match(unavailableResponse.body, /AUTH_INTROSPECTION_UNAVAILABLE/)
  console.log('  ✅ auth middleware 将身份依赖故障映射为 503')
}

main().catch((error) => {
  console.error(`  ❌ Logto JWKS: ${error.stack || error.message}`)
  process.exitCode = 1
})
