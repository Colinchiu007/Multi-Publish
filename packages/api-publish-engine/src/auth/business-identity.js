const crypto = require('crypto')

class BusinessIdentityError extends Error {
  constructor(code, message, status) {
    super(`${code}: ${message || code}`)
    this.code = code
    if (status) this.status = status
  }
}

function assertBusinessUserActive(user) {
  if (!user) throw new BusinessIdentityError('BUSINESS_USER_UNAVAILABLE', undefined, 503)
  if (user.status === 'active') return user
  const code = user.status === 'suspended'
    ? 'BUSINESS_USER_SUSPENDED'
    : user.status === 'deleted' ? 'BUSINESS_USER_DELETED' : 'BUSINESS_USER_INACTIVE'
  throw new BusinessIdentityError(code, undefined, 403)
}

async function ensureBusinessUser(repository, auth, profile = {}) {
  if (!auth || typeof auth.subject !== 'string' || !auth.subject) throw new BusinessIdentityError('AUTH_SUBJECT_INVALID')
  if (!repository || typeof repository.findBySubject !== 'function' || typeof repository.create !== 'function') {
    throw new BusinessIdentityError('BUSINESS_USER_REPOSITORY_INVALID')
  }
  const provider = 'logto'
  const existing = await repository.findBySubject(provider, auth.subject)
  if (existing) {
    assertBusinessUserActive(existing)
    if (typeof repository.updateProfile === 'function' && (profile.name || profile.avatar)) {
      await repository.updateProfile(existing.id, {
        display_name: typeof profile.name === 'string' ? profile.name.slice(0, 100) : undefined,
        avatar_url: typeof profile.avatar === 'string' ? profile.avatar.slice(0, 500) : undefined,
      })
    }
    return existing
  }
  const record = {
    id: crypto.randomUUID(),
    auth_provider: provider,
    auth_subject: auth.subject,
    status: 'active',
    display_name: typeof profile.name === 'string' ? profile.name.slice(0, 100) : null,
    avatar_url: typeof profile.avatar === 'string' ? profile.avatar.slice(0, 500) : null,
  }
  try {
    return assertBusinessUserActive(await repository.create(record))
  } catch (error) {
    if (typeof repository.findBySubject === 'function') {
      const concurrent = await repository.findBySubject(provider, auth.subject)
      if (concurrent) return assertBusinessUserActive(concurrent)
    }
    throw error
  }
}

function isOwnedBySubject(resource, auth) {
  return Boolean(resource && auth && typeof auth.subject === 'string' && resource.auth_subject === auth.subject)
}

function verifyLogtoWebhookSignature(rawBody, signature, signingKey) {
  if (typeof rawBody !== 'string' || typeof signature !== 'string' || !signingKey) {
    throw new BusinessIdentityError('WEBHOOK_SIGNATURE_INVALID')
  }
  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex')
  const actualBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new BusinessIdentityError('WEBHOOK_SIGNATURE_INVALID')
  }
  return true
}

module.exports = {
  BusinessIdentityError,
  assertBusinessUserActive,
  ensureBusinessUser,
  isOwnedBySubject,
  verifyLogtoWebhookSignature,
}
