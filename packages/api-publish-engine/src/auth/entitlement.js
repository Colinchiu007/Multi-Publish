const crypto = require('crypto')

const DEFAULT_CLOCK_TOLERANCE = 60
const MAX_CLOCK_TOLERANCE = 300

class EntitlementError extends Error {
  constructor(code, message) {
    super(`${code}: ${message || code}`)
    this.code = code
  }
}

function encode(value) {
  return Buffer.from(value).toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url')
}

function normalizeClockTolerance(value) {
  if (!Number.isFinite(value)) return DEFAULT_CLOCK_TOLERANCE
  return Math.min(MAX_CLOCK_TOLERANCE, Math.max(0, value))
}

function signEntitlement(payload, privateKey) {
  if (!payload || typeof payload !== 'object' || !payload.kid) throw new EntitlementError('ENTITLEMENT_INVALID')
  const encoded = encode(JSON.stringify(payload))
  const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')
  return `${encoded}.${signature}`
}

function verifyEntitlement(token, options = {}) {
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 2) throw new EntitlementError('ENTITLEMENT_INVALID')
  let payload
  try { payload = JSON.parse(decode(parts[0]).toString('utf8')) } catch { throw new EntitlementError('ENTITLEMENT_INVALID') }
  if (!payload.kid || !options.publicKeys || !options.publicKeys[payload.kid]) throw new EntitlementError('ENTITLEMENT_KEY_INVALID')
  if (payload.sub !== options.subject || payload.device_id !== options.deviceId) throw new EntitlementError('ENTITLEMENT_BINDING_INVALID')
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000)
  const clockTolerance = normalizeClockTolerance(options.clockTolerance)
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) ||
      payload.iat > now + clockTolerance || payload.exp <= now - clockTolerance) {
    throw new EntitlementError('ENTITLEMENT_EXPIRED')
  }
  const valid = crypto.verify('RSA-SHA256', Buffer.from(parts[0]), options.publicKeys[payload.kid], decode(parts[1]))
  if (!valid) throw new EntitlementError('ENTITLEMENT_SIGNATURE_INVALID')
  return payload
}

module.exports = { EntitlementError, normalizeClockTolerance, signEntitlement, verifyEntitlement }
