const crypto = require('crypto')
const { verifyLogtoWebhookSignature } = require('./business-identity')

const LOGTO_WEBHOOK_SIGNATURE_HEADER = 'logto-signature-sha-256'
const DEFAULT_MAX_BODY_BYTES = 256 * 1024
const DEFAULT_MAX_EVENT_AGE_MS = 15 * 60 * 1000
const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const LOGTO_WEBHOOK_EVENTS = Object.freeze([
  'User.Created',
  'User.Data.Updated',
  'User.SuspensionStatus.Updated',
  'User.Deleted',
])
const ALLOWED_EVENTS = new Set(LOGTO_WEBHOOK_EVENTS)

class LogtoWebhookError extends Error {
  constructor(code, message, status = 400) {
    super(message || code)
    this.name = 'LogtoWebhookError'
    this.code = code
    this.status = status
  }
}

function assertNonEmptyString(value, code, status = 400) {
  if (typeof value !== 'string' || value.length === 0) throw new LogtoWebhookError(code, undefined, status)
  return value
}

function deriveLogtoWebhookEventId(payload, rawBody) {
  if (payload && typeof payload.eventId === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(payload.eventId)) {
    return payload.eventId
  }
  return `sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`
}

function normalizeProfile(data) {
  const patch = {}
  if (Object.prototype.hasOwnProperty.call(data, 'name')) {
    if (data.name !== null && typeof data.name !== 'string') throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
    patch.display_name = data.name === null ? null : data.name.slice(0, 100)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'avatar')) {
    if (data.avatar !== null && typeof data.avatar !== 'string') throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
    patch.avatar_url = data.avatar === null ? null : data.avatar.slice(0, 500)
  }
  return patch
}

function readPayload(rawBody) {
  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
  }
  assertNonEmptyString(payload.event, 'WEBHOOK_PAYLOAD_INVALID', 422)
  assertNonEmptyString(payload.hookId, 'WEBHOOK_PAYLOAD_INVALID', 422)
  if (payload.hookId.length > 200) throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
  assertNonEmptyString(payload.createdAt, 'WEBHOOK_PAYLOAD_INVALID', 422)
  if (Number.isNaN(Date.parse(payload.createdAt))) throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
  if (!ALLOWED_EVENTS.has(payload.event)) throw new LogtoWebhookError('WEBHOOK_EVENT_UNSUPPORTED', undefined, 422)
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
  }
  return payload
}

function getSubject(payload) {
  const data = payload.data
  const subject = typeof data.id === 'string' ? data.id : typeof payload.userId === 'string' ? payload.userId : ''
  return subject.trim()
}

function isLogtoTestPayload(payload) {
  return payload.path === '/fake-path/:id' && payload.params && payload.params.id === 'fake-id'
}

function assertEventFreshness(createdAt, receivedAt, maxAgeMs, maxFutureSkewMs) {
  const eventTime = Date.parse(createdAt)
  const ageMs = receivedAt.getTime() - eventTime
  if (ageMs > maxAgeMs) throw new LogtoWebhookError('WEBHOOK_EVENT_STALE', undefined, 422)
  if (ageMs < -maxFutureSkewMs) throw new LogtoWebhookError('WEBHOOK_EVENT_FUTURE', undefined, 422)
}

/**
 * repository.transaction 必须提供真正的数据库事务。transaction 对象需实现：
 * claimWebhookEvent、upsertUserState、revokeUserSessions、completeWebhookEvent。
 * upsertUserState 应使用 eventCreatedAt 拒绝乱序旧事件，并通过 applied=false 告知调用方跳过副作用。
 * preserveDeleted=true 时还应保留删除墓碑。
 */
class LogtoWebhookConsumer {
  constructor(options = {}) {
    if (typeof options.signingKey !== 'string' || options.signingKey.length === 0) {
      throw new TypeError('Logto webhook signingKey is required')
    }
    if (!options.repository || typeof options.repository.transaction !== 'function') {
      throw new TypeError('Logto webhook repository.transaction is required')
    }
    this.signingKey = options.signingKey
    this.repository = options.repository
    this.maxBodyBytes = Number.isInteger(options.maxBodyBytes) && options.maxBodyBytes > 0
      ? options.maxBodyBytes
      : DEFAULT_MAX_BODY_BYTES
    this.maxEventAgeMs = Number.isFinite(options.maxEventAgeMs) && options.maxEventAgeMs > 0
      ? options.maxEventAgeMs
      : DEFAULT_MAX_EVENT_AGE_MS
    this.maxFutureSkewMs = Number.isFinite(options.maxFutureSkewMs) && options.maxFutureSkewMs >= 0
      ? options.maxFutureSkewMs
      : DEFAULT_MAX_FUTURE_SKEW_MS
    this.now = typeof options.now === 'function' ? options.now : () => new Date()
  }

  async consume({ rawBody, signature }) {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody
    if (typeof raw !== 'string') throw new LogtoWebhookError('WEBHOOK_BODY_INVALID', undefined, 400)
    if (Buffer.byteLength(raw, 'utf8') > this.maxBodyBytes) {
      throw new LogtoWebhookError('WEBHOOK_BODY_TOO_LARGE', undefined, 413)
    }

    // 必须先验签，再解析 JSON 或访问任何业务字段。
    try {
      verifyLogtoWebhookSignature(raw, signature, this.signingKey)
    } catch {
      throw new LogtoWebhookError('WEBHOOK_SIGNATURE_INVALID', undefined, 401)
    }
    const payload = readPayload(raw)
    const eventId = deriveLogtoWebhookEventId(payload, raw)
    const subject = getSubject(payload)
    const receivedAt = new Date(this.now())
    if (Number.isNaN(receivedAt.getTime())) throw new LogtoWebhookError('WEBHOOK_CLOCK_INVALID', undefined, 500)

    // Logto 控制台的“测试 webhook”使用 fake payload，不应产生业务用户。
    if (!subject && isLogtoTestPayload(payload)) {
      return { accepted: true, duplicate: false, ignored: true, eventId, event: payload.event }
    }
    if (!subject) throw new LogtoWebhookError('WEBHOOK_SUBJECT_INVALID', undefined, 422)
    if (subject.length > 200) throw new LogtoWebhookError('WEBHOOK_SUBJECT_INVALID', undefined, 422)
    // 在声明幂等记录前拒绝过期或超前事件，避免非事务仓储留下 processing 占位。
    assertEventFreshness(payload.createdAt, receivedAt, this.maxEventAgeMs, this.maxFutureSkewMs)

    const record = {
      id: eventId,
      provider: 'logto',
      event: payload.event,
      hookId: payload.hookId,
      subject,
      createdAt: payload.createdAt,
      receivedAt: receivedAt.toISOString(),
    }
    return this.repository.transaction(async (transaction) => {
      if (!transaction || typeof transaction.claimWebhookEvent !== 'function') {
        throw new LogtoWebhookError('WEBHOOK_REPOSITORY_INVALID', undefined, 500)
      }
      const claimed = await transaction.claimWebhookEvent(record)
      if (!claimed) return { accepted: true, duplicate: true, eventId, event: payload.event }

      const patch = normalizeProfile(payload.data)
      if (payload.event === 'User.SuspensionStatus.Updated') {
        if (typeof payload.data.isSuspended !== 'boolean') {
          throw new LogtoWebhookError('WEBHOOK_PAYLOAD_INVALID', undefined, 422)
        }
        patch.status = payload.data.isSuspended ? 'suspended' : 'active'
      } else if (payload.event === 'User.Deleted') {
        patch.status = 'deleted'
      } else if (payload.event === 'User.Created') {
        patch.status = 'active'
      }

      if (typeof transaction.upsertUserState !== 'function') {
        throw new LogtoWebhookError('WEBHOOK_REPOSITORY_INVALID', undefined, 500)
      }
      const stateUpdate = await transaction.upsertUserState('logto', subject, patch, {
        eventId,
        eventCreatedAt: payload.createdAt,
        preserveDeleted: patch.status === 'active',
      })
      const stateApplied = !stateUpdate || stateUpdate.applied !== false

      if (stateApplied && ((payload.event === 'User.SuspensionStatus.Updated' && patch.status === 'suspended') || payload.event === 'User.Deleted')) {
        if (typeof transaction.revokeUserSessions !== 'function') {
          throw new LogtoWebhookError('WEBHOOK_REPOSITORY_INVALID', undefined, 500)
        }
        await transaction.revokeUserSessions('logto', subject, payload.event === 'User.Deleted' ? 'user_deleted' : 'user_suspended')
      }
      if (typeof transaction.completeWebhookEvent !== 'function') {
        throw new LogtoWebhookError('WEBHOOK_REPOSITORY_INVALID', undefined, 500)
      }
      await transaction.completeWebhookEvent(eventId, { subject, event: payload.event, ignored: !stateApplied })
      return {
        accepted: true,
        duplicate: false,
        eventId,
        event: payload.event,
        ...(!stateApplied ? { ignored: true } : {}),
      }
    })
  }
}

module.exports = {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_EVENT_AGE_MS,
  DEFAULT_MAX_FUTURE_SKEW_MS,
  LOGTO_WEBHOOK_EVENTS,
  LOGTO_WEBHOOK_SIGNATURE_HEADER,
  LogtoWebhookConsumer,
  LogtoWebhookError,
  deriveLogtoWebhookEventId,
}
