const crypto = require('crypto')

function error(code, variable) {
  return { code, variable }
}

function parseBoolean(value, variable, errors, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  errors.push(error('BOOLEAN_VALUE_INVALID', variable))
  return fallback
}

function parseHttpsUrl(value, variable, errors, code) {
  let url
  try { url = new URL(String(value || '').trim()) } catch {
    errors.push(error(code, variable))
    return null
  }
  if (url.username || url.password || url.protocol !== 'https:') {
    errors.push(error(code, variable))
    return null
  }
  return url
}

function parsePostgresUrl(value, variable, errors) {
  let url
  const invalidCode = `${variable}_INVALID`
  try { url = new URL(String(value || '').trim()) } catch {
    errors.push(error(invalidCode, variable))
    return null
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/') {
    errors.push(error(invalidCode, variable))
    return null
  }
  let username
  let password
  try {
    username = decodeURIComponent(url.username || '')
    password = decodeURIComponent(url.password || '')
  } catch {
    errors.push(error(invalidCode, variable))
    return null
  }
  if (!username || !password) errors.push(error('DATABASE_CREDENTIALS_REQUIRED', variable))
  else if (password.length < 12) errors.push(error('DATABASE_PASSWORD_TOO_SHORT', variable))
  return url
}

function databaseTarget(url) {
  if (!url) return null
  const port = url.port || '5432'
  return `${url.hostname.toLowerCase()}:${port}${url.pathname}`
}

function validateEntitlementKey(env, errors) {
  const value = String(env.ENTITLEMENT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  if (!value) {
    errors.push(error('ENTITLEMENT_PRIVATE_KEY_REQUIRED', 'ENTITLEMENT_PRIVATE_KEY'))
    return
  }
  try {
    const key = crypto.createPrivateKey(value)
    if (key.asymmetricKeyType !== 'rsa') throw new Error('权益私钥必须是 RSA 类型')
  } catch {
    errors.push(error('ENTITLEMENT_PRIVATE_KEY_INVALID', 'ENTITLEMENT_PRIVATE_KEY'))
  }
}

function validateProductionConfig(env = {}, options = {}) {
  const errors = []
  const warnings = []
  const phase = String(options.phase || 'shadow').trim().toLowerCase()
  if (!['shadow', 'required', 'rollback'].includes(phase)) {
    errors.push(error('ROLLOUT_PHASE_INVALID', 'phase'))
  }

  if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
    errors.push(error('NODE_ENV_PRODUCTION_REQUIRED', 'NODE_ENV'))
  }

  const authEnabled = parseBoolean(env.IDENTITY_AUTH_ENABLED, 'IDENTITY_AUTH_ENABLED', errors)
  const authRequired = parseBoolean(env.IDENTITY_AUTH_REQUIRED, 'IDENTITY_AUTH_REQUIRED', errors)
  const autoMigrate = parseBoolean(env.BUSINESS_DATABASE_AUTO_MIGRATE, 'BUSINESS_DATABASE_AUTO_MIGRATE', errors)

  if (authRequired && !authEnabled) errors.push(error('AUTH_FLAGS_CONFLICT', 'IDENTITY_AUTH_REQUIRED'))
  if (!authEnabled) errors.push(error('AUTH_ENABLED_REQUIRED', 'IDENTITY_AUTH_ENABLED'))
  if (phase === 'required' && !authRequired) errors.push(error('AUTH_REQUIRED_PHASE_MISMATCH', 'IDENTITY_AUTH_REQUIRED'))
  if ((phase === 'shadow' || phase === 'rollback') && authRequired) {
    errors.push(error('AUTH_REQUIRED_PHASE_MISMATCH', 'IDENTITY_AUTH_REQUIRED'))
  }
  if (autoMigrate) errors.push(error('PRODUCTION_AUTO_MIGRATE_FORBIDDEN', 'BUSINESS_DATABASE_AUTO_MIGRATE'))

  parseHttpsUrl(env.LOGTO_ISSUER || env.LOGTO_ENDPOINT, env.LOGTO_ISSUER ? 'LOGTO_ISSUER' : 'LOGTO_ENDPOINT', errors, 'LOGTO_ENDPOINT_HTTPS_REQUIRED')
  parseHttpsUrl(env.LOGTO_API_RESOURCE, 'LOGTO_API_RESOURCE', errors, 'LOGTO_API_RESOURCE_INVALID')
  const businessDatabase = parsePostgresUrl(env.BUSINESS_DATABASE_URL, 'BUSINESS_DATABASE_URL', errors)

  let logtoDatabase = null
  if (String(env.LOGTO_DATABASE_URL || '').trim()) {
    logtoDatabase = parsePostgresUrl(env.LOGTO_DATABASE_URL, 'LOGTO_DATABASE_URL', errors)
  } else {
    warnings.push({ code: 'LOGTO_DATABASE_URL_NOT_PROVIDED', variable: 'LOGTO_DATABASE_URL' })
  }
  if (businessDatabase && logtoDatabase && databaseTarget(businessDatabase) === databaseTarget(logtoDatabase)) {
    errors.push(error('DATABASE_SEPARATION_REQUIRED', 'BUSINESS_DATABASE_URL'))
  }

  const webhookKey = String(env.LOGTO_WEBHOOK_SIGNING_KEY || '')
  if (!webhookKey) errors.push(error('WEBHOOK_SIGNING_KEY_REQUIRED', 'LOGTO_WEBHOOK_SIGNING_KEY'))
  else if (webhookKey.length < 32) errors.push(error('WEBHOOK_SIGNING_KEY_TOO_SHORT', 'LOGTO_WEBHOOK_SIGNING_KEY'))

  if (!String(env.ENTITLEMENT_KEY_ID || '').trim()) {
    errors.push(error('ENTITLEMENT_KEY_ID_REQUIRED', 'ENTITLEMENT_KEY_ID'))
  }
  validateEntitlementKey(env, errors)

  return {
    valid: errors.length === 0,
    phase,
    errors,
    warnings,
    config: {
      authEnabled,
      authRequired,
      autoMigrate,
      businessDatabaseConfigured: Boolean(businessDatabase),
      logtoDatabaseCompared: Boolean(logtoDatabase),
      webhookConfigured: webhookKey.length >= 32,
      entitlementSigningConfigured: Boolean(String(env.ENTITLEMENT_PRIVATE_KEY || '').trim()),
    },
  }
}

module.exports = { validateProductionConfig }
