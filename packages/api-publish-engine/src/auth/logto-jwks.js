const crypto = require('crypto')
const { AuthError, parseBearerToken, verifyJwtClaims, requireScopes } = require('./logto-auth')

const ALLOWED_JWK_PROFILES = Object.freeze({
  RS256: { kty: 'RSA' },
  ES384: { kty: 'EC', crv: 'P-384' },
})

function jsonResponseError(code, cause) {
  return new AuthError(code, 401, cause)
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function parseTrustedIssuerUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new AuthError('AUTH_ISSUER_INVALID') }
  const localHttp = url.protocol === 'http:' && isLoopbackHost(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !localHttp)) {
    throw new AuthError('AUTH_ISSUER_INVALID')
  }
  return url
}

class LogtoJwtVerifier {
  constructor(options = {}) {
    this.issuer = String(options.issuer || '').replace(/\/$/, '')
    this.audience = options.audience
    this.fetcher = options.fetcher || globalThis.fetch
    this.cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : 5 * 60 * 1000
    this.fetchTimeoutMs = Number.isFinite(options.fetchTimeoutMs) && options.fetchTimeoutMs > 0
      ? options.fetchTimeoutMs
      : 10 * 1000
    this.unknownKidCacheTtlMs = Number.isFinite(options.unknownKidCacheTtlMs) && options.unknownKidCacheTtlMs > 0
      ? options.unknownKidCacheTtlMs
      : 30 * 1000
    this.forcedRefreshCooldownMs = Number.isFinite(options.forcedRefreshCooldownMs) && options.forcedRefreshCooldownMs > 0
      ? options.forcedRefreshCooldownMs
      : 1000
    this.unknownKidCacheMax = Number.isInteger(options.unknownKidCacheMax) && options.unknownKidCacheMax > 0
      ? options.unknownKidCacheMax
      : 256
    this.clockMs = typeof options.clockMs === 'function' ? options.clockMs : Date.now
    this.now = options.now || (() => Math.floor(Date.now() / 1000))
    this._discovery = null
    this._discoveryPromise = null
    this._jwks = null
    this._jwksAt = 0
    this._jwksPromise = null
    this._jwksRefreshPromise = null
    this._lastForcedRefreshAt = 0
    this._unknownKidCache = new Map()
    if (!this.issuer || !this.audience || typeof this.fetcher !== 'function') throw new Error('Logto JWKS 配置无效')
  }

  async _fetchJson(url, code) {
    let response
    let timer
    let controller
    try {
      controller = typeof AbortController === 'function' ? new AbortController() : null
      const requestOptions = controller ? { signal: controller.signal } : undefined
      const request = Promise.resolve().then(() => this.fetcher(url, requestOptions))
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort()
          reject(new AuthError(code))
        }, this.fetchTimeoutMs)
      })
      response = await Promise.race([request, timeout])
    } catch (error) {
      if (error && error.code === code) throw error
      throw jsonResponseError(code, error)
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (!response || response.ok !== true || typeof response.json !== 'function') throw new AuthError(code)
    try {
      const parse = Promise.resolve().then(() => response.json())
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AuthError(code)), this.fetchTimeoutMs)
      })
      return await Promise.race([parse, timeout])
    } catch (error) {
      if (error && error.code === code) throw error
      throw jsonResponseError(code, error)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async _getDiscovery() {
    if (this._discovery) return this._discovery
    if (this._discoveryPromise) return this._discoveryPromise
    const issuerUrl = parseTrustedIssuerUrl(this.issuer)
    let promise
    promise = this._fetchJson(`${this.issuer}/.well-known/openid-configuration`, 'AUTH_DISCOVERY_UNAVAILABLE')
      .then((discovery) => {
        if (discovery.issuer !== this.issuer || typeof discovery.jwks_uri !== 'string') throw new AuthError('AUTH_DISCOVERY_INVALID')
        let jwksUrl
        try { jwksUrl = new URL(discovery.jwks_uri) } catch { throw new AuthError('AUTH_JWKS_URL_INVALID') }
        const localHttp = issuerUrl.protocol === 'http:' && isLoopbackHost(issuerUrl.hostname) &&
          jwksUrl.protocol === 'http:' && isLoopbackHost(jwksUrl.hostname)
        if (jwksUrl.username || jwksUrl.password || jwksUrl.origin !== issuerUrl.origin ||
            (jwksUrl.protocol !== 'https:' && !localHttp)) {
          throw new AuthError('AUTH_JWKS_URL_INVALID')
        }
        this._discovery = { ...discovery, jwks_uri: jwksUrl.toString() }
        return this._discovery
      })
      .finally(() => {
        if (this._discoveryPromise === promise) this._discoveryPromise = null
      })
    this._discoveryPromise = promise
    return promise
  }

  async _getJwks(force = false) {
    const currentMs = this.clockMs()
    if (!force && this._jwks && currentMs - this._jwksAt < this.cacheTtlMs) return this._jwks
    if (force && this._jwks && currentMs - this._lastForcedRefreshAt < this.forcedRefreshCooldownMs) return this._jwks
    if (force && this._jwksRefreshPromise) return this._jwksRefreshPromise
    if (!force && this._jwksRefreshPromise) return this._jwksRefreshPromise
    if (!force && this._jwksPromise) return this._jwksPromise

    const load = async () => {
      const discovery = await this._getDiscovery()
      const body = await this._fetchJson(discovery.jwks_uri, 'AUTH_JWKS_UNAVAILABLE')
      if (!body || !Array.isArray(body.keys)) throw new AuthError('AUTH_JWKS_INVALID')
      this._jwks = body.keys.filter((key) => {
        const profile = key && ALLOWED_JWK_PROFILES[key.alg]
        if (!profile || !key.kid || key.kty !== profile.kty) return false
        if (profile.crv && key.crv !== profile.crv) return false
        if (key.use !== undefined && key.use !== 'sig') return false
        if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) return false
        return true
      })
      this._jwksAt = this.clockMs()
      return this._jwks
    }

    let promise
    if (force) {
      this._lastForcedRefreshAt = currentMs
      const previous = this._jwksPromise
      promise = (previous ? previous.catch(() => undefined) : Promise.resolve())
        .then(load)
        .finally(() => {
          if (this._jwksRefreshPromise === promise) this._jwksRefreshPromise = null
        })
      this._jwksRefreshPromise = promise
    } else {
      promise = load().finally(() => {
        if (this._jwksPromise === promise) this._jwksPromise = null
      })
      this._jwksPromise = promise
    }
    return promise
  }

  async _getKey(kid, algorithm) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(kid)) throw new AuthError('AUTH_KEY_NOT_FOUND')
    const currentMs = this.clockMs()
    const cacheKey = `${algorithm}:${kid}`
    const negativeExpiry = this._unknownKidCache.get(cacheKey)
    if (negativeExpiry && negativeExpiry > currentMs) throw new AuthError('AUTH_KEY_NOT_FOUND')
    if (negativeExpiry) this._unknownKidCache.delete(cacheKey)
    let keys = await this._getJwks()
    let jwk = keys.find((key) => key.kid === kid && key.alg === algorithm)
    if (!jwk) {
      keys = await this._getJwks(true)
      jwk = keys.find((key) => key.kid === kid && key.alg === algorithm)
    }
    if (!jwk) {
      if (this._unknownKidCache.size >= this.unknownKidCacheMax) {
        const oldest = this._unknownKidCache.keys().next().value
        if (oldest !== undefined) this._unknownKidCache.delete(oldest)
      }
      this._unknownKidCache.set(cacheKey, currentMs + this.unknownKidCacheTtlMs)
      throw new AuthError('AUTH_KEY_NOT_FOUND')
    }
    this._unknownKidCache.delete(cacheKey)
    try { return crypto.createPublicKey({ key: jwk, format: 'jwk' }) } catch (error) { throw jsonResponseError('AUTH_KEY_INVALID', error) }
  }

  async verify(token) {
    const parts = typeof token === 'string' ? token.split('.') : []
    if (parts.length !== 3) throw new AuthError('AUTH_TOKEN_INVALID')
    let header
    try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) } catch { throw new AuthError('AUTH_TOKEN_INVALID') }
    if (!ALLOWED_JWK_PROFILES[header.alg] || typeof header.kid !== 'string' || !header.kid) {
      throw new AuthError('AUTH_ALGORITHM_INVALID')
    }
    const publicKey = await this._getKey(header.kid, header.alg)
    return verifyJwtClaims(token, {
      publicKey,
      algorithm: header.alg,
      issuer: this.issuer,
      audience: this.audience,
      now: this.now(),
    })
  }

  async checkReady() {
    await this._getDiscovery()
    const keys = await this._getJwks()
    if (!Array.isArray(keys) || keys.length === 0) throw new AuthError('AUTH_JWKS_INVALID')
    return { oidc: 'ready', jwks: 'ready', signingKeys: keys.length }
  }
}

function createLogtoJwtVerifier(options) {
  return new LogtoJwtVerifier(options)
}

function createLogtoAuthMiddleware(options = {}) {
  const verifier = options.verifier || createLogtoJwtVerifier(options)
  const requiredScopes = options.requiredScopes || []
  return async function logtoAuthMiddleware(req, res, next) {
    try {
      const header = req && req.headers && (req.headers.authorization || req.headers.Authorization)
      const auth = await verifier.verify(parseBearerToken(header))
      requireScopes(auth, requiredScopes)
      req.auth = auth
      return next()
    } catch (error) {
      const code = error && error.code ? error.code : 'AUTH_TOKEN_INVALID'
      const status = error && error.status === 403 ? 403 : 401
      if (res && typeof res.writeHead === 'function') res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      if (res && typeof res.end === 'function') res.end(JSON.stringify({ code, message: status === 403 ? '权限不足' : '身份验证失败' }))
      return undefined
    }
  }
}

module.exports = { LogtoJwtVerifier, createLogtoJwtVerifier, createLogtoAuthMiddleware }
