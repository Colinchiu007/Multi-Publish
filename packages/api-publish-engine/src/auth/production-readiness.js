function stableCode(error, fallback) {
  const code = error && typeof error.code === 'string' ? error.code : ''
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : fallback
}

function createProductionReadinessProbe(options = {}) {
  const repository = options.repository
  const verifier = options.verifier
  const clockMs = typeof options.clockMs === 'function' ? options.clockMs : Date.now
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs) && options.cacheTtlMs > 0 ? options.cacheTtlMs : 1000
  let cached = null
  let inFlight = null

  async function checkDependencies() {
    const startedAt = clockMs()
    const checks = {}
    const [databaseResult, oidcResult] = await Promise.allSettled([
      repository && typeof repository.assertReady === 'function'
        ? repository.assertReady()
        : Promise.reject(Object.assign(new Error('业务数据库仓库未配置'), { code: 'BUSINESS_DATABASE_READINESS_UNAVAILABLE' })),
      verifier && typeof verifier.checkReady === 'function'
        ? verifier.checkReady()
        : Promise.reject(Object.assign(new Error('OIDC 校验器未配置'), { code: 'OIDC_READINESS_UNAVAILABLE' })),
    ])

    if (databaseResult.status === 'fulfilled') {
      checks.database = { status: 'ready' }
      checks.schema = { status: 'ready' }
    } else {
      const code = stableCode(databaseResult.reason, 'BUSINESS_DATABASE_UNAVAILABLE')
      checks.database = { status: 'failed', code }
      checks.schema = { status: 'failed', code }
    }

    if (oidcResult.status === 'fulfilled') {
      const value = oidcResult.value || {}
      checks.oidc = { status: 'ready' }
      checks.jwks = {
        status: 'ready',
        ...(Number.isInteger(value.signingKeys) ? { signingKeys: value.signingKeys } : {}),
      }
    } else {
      const code = stableCode(oidcResult.reason, 'OIDC_UNAVAILABLE')
      checks.oidc = { status: 'failed', code }
      checks.jwks = { status: 'failed', code }
    }

    const finishedAt = clockMs()
    const result = {
      status: Object.values(checks).every((check) => check.status === 'ready') ? 'ready' : 'not_ready',
      checks,
      durationMs: Math.max(0, finishedAt - startedAt),
    }
    cached = { at: finishedAt, result }
    return result
  }

  return {
    async check() {
      const now = clockMs()
      if (cached && now - cached.at < cacheTtlMs) return cached.result
      if (inFlight) return inFlight
      inFlight = checkDependencies().finally(() => { inFlight = null })
      return inFlight
    },
  }
}

module.exports = { createProductionReadinessProbe, stableCode }
