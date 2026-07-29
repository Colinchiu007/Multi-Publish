const crypto = require('crypto')
const { IdentityError } = require('./identity-errors')

const DEFAULT_CLOCK_TOLERANCE = 60
const MAX_CLOCK_TOLERANCE = 300

function normalizeClockTolerance(value) {
  if (!Number.isFinite(value)) return DEFAULT_CLOCK_TOLERANCE
  return Math.min(MAX_CLOCK_TOLERANCE, Math.max(0, value))
}

function verifyEntitlementSnapshot(snapshot, options) {
  if (!snapshot || typeof snapshot !== 'object' || !options || typeof options !== 'object') {
    throw new IdentityError('ENTITLEMENT_INVALID', '权益快照格式无效')
  }
  if (!snapshot.kid || typeof snapshot.kid !== 'string') {
    throw new IdentityError('ENTITLEMENT_KEY_INVALID', '权益签名 key id 缺失')
  }
  if (snapshot.sub !== options.subject || snapshot.device_id !== options.deviceId) {
    throw new IdentityError('ENTITLEMENT_BINDING_INVALID', '权益快照与当前账号或设备不匹配')
  }
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000)
  const clockTolerance = normalizeClockTolerance(options.clockTolerance)
  if (!Number.isFinite(snapshot.iat) || !Number.isFinite(snapshot.exp) ||
      snapshot.iat > now + clockTolerance || snapshot.exp <= now - clockTolerance) {
    throw new IdentityError('ENTITLEMENT_EXPIRED', '权益快照已过期或尚未生效')
  }
  let valid
  try {
    valid = typeof options.verify === 'function' && options.verify(snapshot) === true
  } catch (_) {
    valid = false
  }
  if (!valid) {
    throw new IdentityError('ENTITLEMENT_SIGNATURE_INVALID', '权益快照签名无效')
  }
  return snapshot
}

function verifyEntitlementToken(token, options = {}) {
  if (typeof token !== 'string' || token.length > 64 * 1024) {
    throw new IdentityError('ENTITLEMENT_INVALID', '权益令牌格式无效')
  }
  const parts = token.split('.')
  if (parts.length !== 2) throw new IdentityError('ENTITLEMENT_INVALID', '权益令牌格式无效')
  let snapshot
  try {
    snapshot = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch (error) {
    throw new IdentityError('ENTITLEMENT_INVALID', '权益令牌载荷无效', error)
  }
  const publicKey = options.publicKeys && snapshot && options.publicKeys[snapshot.kid]
  if (!publicKey) throw new IdentityError('ENTITLEMENT_KEY_INVALID', '权益签名 key id 无效')
  return verifyEntitlementSnapshot(snapshot, {
    subject: options.subject,
    deviceId: options.deviceId,
    now: options.now,
    clockTolerance: options.clockTolerance,
    verify: () => crypto.verify(
      'RSA-SHA256',
      Buffer.from(parts[0]),
      publicKey,
      Buffer.from(parts[1], 'base64url'),
    ),
  })
}

module.exports = { normalizeClockTolerance, verifyEntitlementSnapshot, verifyEntitlementToken }
