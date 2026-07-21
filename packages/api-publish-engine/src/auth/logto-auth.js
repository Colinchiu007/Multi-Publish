const crypto = require('crypto')

class AuthError extends Error {
  constructor(code, status = 401) {
    super(code)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}

function parseBearerToken(header) {
  if (typeof header !== 'string') throw new AuthError('AUTH_TOKEN_MISSING')
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim())
  if (!match) throw new AuthError('AUTH_TOKEN_MISSING')
  return match[1]
}

function decodePart(value, code) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JWT part must be an object')
    return parsed
  } catch {
    throw new AuthError(code)
  }
}

function audienceMatches(actual, expected) {
  return typeof actual === 'string' ? actual === expected : Array.isArray(actual) && actual.includes(expected)
}

function verifyJwtClaims(token, options = {}) {
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3) throw new AuthError('AUTH_TOKEN_INVALID')
  const header = decodePart(parts[0], 'AUTH_TOKEN_INVALID')
  const claims = decodePart(parts[1], 'AUTH_TOKEN_INVALID')
  if (header.alg !== 'RS256') throw new AuthError('AUTH_ALGORITHM_INVALID')
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    options.publicKey,
    Buffer.from(parts[2], 'base64url'),
  )
  if (!verified) throw new AuthError('AUTH_SIGNATURE_INVALID')
  if (claims.iss !== options.issuer) throw new AuthError('AUTH_ISSUER_INVALID')
  if (!audienceMatches(claims.aud, options.audience)) throw new AuthError('AUTH_AUDIENCE_INVALID')
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000)
  const clockTolerance = Number.isFinite(options.clockTolerance) ? options.clockTolerance : 60
  if (!Number.isFinite(claims.exp) || claims.exp <= now - clockTolerance) throw new AuthError('AUTH_TOKEN_EXPIRED')
  if (Object.prototype.hasOwnProperty.call(claims, 'nbf') &&
      (!Number.isFinite(claims.nbf) || claims.nbf > now + clockTolerance)) {
    throw new AuthError('AUTH_TOKEN_NOT_ACTIVE')
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw new AuthError('AUTH_SUBJECT_INVALID')
  const scopes = Array.isArray(claims.scope)
    ? claims.scope.filter((value) => typeof value === 'string')
    : typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean) : []
  return { subject: claims.sub, scopes }
}

function requireScopes(auth, requiredScopes = []) {
  const available = new Set(auth && Array.isArray(auth.scopes) ? auth.scopes : [])
  if (!requiredScopes.every((scope) => available.has(scope))) {
    throw new AuthError('AUTH_SCOPE_MISSING', 403)
  }
  return true
}

module.exports = { AuthError, parseBearerToken, verifyJwtClaims, requireScopes }
