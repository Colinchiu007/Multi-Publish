class IdentityError extends Error {
  constructor(code, message, cause) {
    super(message ? `${code}: ${message}` : code)
    this.name = 'IdentityError'
    this.code = code
    if (cause) this.cause = cause
  }
}

function toIdentityError(error, fallbackCode = 'IDENTITY_OPERATION_FAILED') {
  if (error instanceof IdentityError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new IdentityError(fallbackCode, message, error)
}

module.exports = { IdentityError, toIdentityError }
