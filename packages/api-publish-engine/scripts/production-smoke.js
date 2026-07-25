#!/usr/bin/env node
const { URL } = require('url')

function parseArgs(argv = process.argv.slice(2)) {
  const result = { timeoutMs: 5000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--logto' && argv[index + 1]) result.logto = argv[++index]
    else if (arg === '--api' && argv[index + 1]) result.api = argv[++index]
    else if (arg === '--token' && argv[index + 1]) result.token = argv[++index]
    else if (arg === '--timeout-ms' && argv[index + 1]) result.timeoutMs = Number(argv[++index])
    else if (arg === '--help' || arg === '-h') result.help = true
  }
  return result
}

function trimSlash(value) { return String(value || '').replace(/\/+$/, '') }

function isLoopback(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(String(url.hostname || '').toLowerCase())
}

function validateSmokeEndpoint(value, variable) {
  let url
  try { url = new URL(trimSlash(value)) } catch {
    return { valid: false, code: `${variable}_INVALID` }
  }
  if (url.username || url.password) return { valid: false, code: `${variable}_INVALID` }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    return { valid: false, code: `${variable}_HTTPS_REQUIRED` }
  }
  return { valid: true, value: url.toString().replace(/\/$/, '') }
}

function issuerFromEndpoint(value) {
  const endpointResult = validateSmokeEndpoint(value, 'LOGTO_ENDPOINT')
  if (!endpointResult.valid) throw Object.assign(new Error(endpointResult.code), { code: endpointResult.code })
  const endpoint = endpointResult.value
  return endpoint.endsWith('/oidc') ? endpoint : `${endpoint}/oidc`
}

async function requestJson(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 5000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: options.headers || {} })
    let body = null
    try { body = await response.json() } catch { body = null }
    return { response, body }
  } finally {
    clearTimeout(timer)
  }
}

function check(name, status, code, durationMs) {
  return { name, status, ...(code ? { code } : {}), durationMs }
}

async function runSmokeChecks(options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5000
  const results = []
  if (!options.logto) results.push(check('logto.discovery', 'failed', 'LOGTO_ENDPOINT_REQUIRED', 0))
  if (!options.api) results.push(check('api.health', 'failed', 'API_ENDPOINT_REQUIRED', 0))

  if (options.logto) {
    const started = Date.now()
    try {
      const issuer = issuerFromEndpoint(options.logto)
      const discoveryUrl = `${issuer}/.well-known/openid-configuration`
      const { response, body } = await requestJson(discoveryUrl, { timeoutMs })
      if (!response.ok || !body || body.issuer !== issuer || typeof body.jwks_uri !== 'string') {
        results.push(check('logto.discovery', 'failed', 'OIDC_DISCOVERY_INVALID', Date.now() - started))
      } else {
        results.push(check('logto.discovery', 'passed', null, Date.now() - started))
        const jwksStarted = Date.now()
        try {
          const jwksUrl = new URL(body.jwks_uri)
          const issuerUrl = new URL(issuer)
          const jwks = await requestJson(jwksUrl.toString(), { timeoutMs })
          const trustedProtocol = jwksUrl.protocol === 'https:' ||
            (jwksUrl.protocol === 'http:' && issuerUrl.protocol === 'http:' && isLoopback(jwksUrl) && isLoopback(issuerUrl))
          const valid = jwksUrl.origin === issuerUrl.origin && trustedProtocol &&
            jwks.response.ok && jwks.body && Array.isArray(jwks.body.keys) && jwks.body.keys.length > 0
          results.push(check('logto.jwks', valid ? 'passed' : 'failed', valid ? null : 'OIDC_JWKS_INVALID', Date.now() - jwksStarted))
        } catch {
          results.push(check('logto.jwks', 'failed', 'OIDC_JWKS_UNAVAILABLE', Date.now() - jwksStarted))
        }
      }
    } catch (error) {
      results.push(check('logto.discovery', 'failed', error && error.code ? error.code : 'OIDC_DISCOVERY_UNAVAILABLE', Date.now() - started))
    }
  }

  if (options.api) {
    const apiEndpoint = validateSmokeEndpoint(options.api, 'API_ENDPOINT')
    if (!apiEndpoint.valid) {
      results.push(check('api.health', 'failed', apiEndpoint.code, 0))
      return { status: 'failed', checks: results }
    }
    for (const endpoint of ['health', 'ready']) {
      const started = Date.now()
      try {
        const headers = options.token ? { Authorization: `Bearer ${options.token}` } : {}
        const { response, body } = await requestJson(`${apiEndpoint.value}/api/v1/${endpoint}`, { timeoutMs, headers })
        const passed = endpoint === 'health'
          ? response.ok && body && body.status === 'ok'
          : response.status === 200 && body && body.status === 'ready'
        results.push(check(`api.${endpoint}`, passed ? 'passed' : 'failed', passed ? null : `API_${endpoint.toUpperCase()}_NOT_READY`, Date.now() - started))
      } catch {
        results.push(check(`api.${endpoint}`, 'failed', `API_${endpoint.toUpperCase()}_UNAVAILABLE`, Date.now() - started))
      }
    }
    if (options.token) {
      const started = Date.now()
      try {
        const { response, body } = await requestJson(`${apiEndpoint.value}/api/v1/me`, {
          timeoutMs,
          headers: { Authorization: `Bearer ${options.token}`, 'X-Device-ID': options.deviceId || 'smoke-device-20260721' },
        })
        const passed = response.ok && body && body.user && typeof body.user.id === 'string'
        results.push(check('api.me', passed ? 'passed' : 'failed', passed ? null : 'API_ME_UNAVAILABLE', Date.now() - started))
      } catch {
        results.push(check('api.me', 'failed', 'API_ME_UNAVAILABLE', Date.now() - started))
      }
    }

    // 路由分离验证：Logto 内部路径（/api/users、/api/forgot-password）被 Nginx 误路由到
    // 业务 API container 时，业务 API 必须返回 404 + PATH_NOT_UNDER_BUSINESS_API，
    // 而非 401 "Valid API key required"。这能自动检测 Nginx /api/ 宽匹配误路由问题。
    // 关联 bug：用户忘记密码报 "Valid API key required"（2026-07-25）。
    // 两种正确状态：
    //   (a) 业务 API 守卫触发：404 + PATH_NOT_UNDER_BUSINESS_API（Nginx 误路由，但业务 API 守住）
    //   (b) Nginx 正确路由到 Logto：响应来自 Logto（非 "Valid API key required"）
    // 失败状态：响应包含 "Valid API key required"（业务 API 错误地走了鉴权流程）
    for (const logtoPath of ['/api/users', '/api/forgot-password']) {
      const started = Date.now()
      try {
        const { response, body } = await requestJson(`${apiEndpoint.value}${logtoPath}`, { timeoutMs })
        const bodyText = body ? JSON.stringify(body) : ''
        const isBusinessApiGuard = response.status === 404 && body && body.error === 'PATH_NOT_UNDER_BUSINESS_API'
        const isLogtoResponse = !/Valid API key required/.test(bodyText)
        const passed = isBusinessApiGuard || isLogtoResponse
        results.push(check(`api.path-guard${logtoPath}`, passed ? 'passed' : 'failed', passed ? null : 'API_PATH_GUARD_VIOLATION', Date.now() - started))
      } catch {
        results.push(check(`api.path-guard${logtoPath}`, 'failed', 'API_PATH_GUARD_UNAVAILABLE', Date.now() - started))
      }
    }
  }

  return { status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed', checks: results }
}

async function main(options = parseArgs()) {
  if (options.help) {
    console.log('用法: production-smoke --logto https://id.example.com --api http://127.0.0.1:3000 [--token TOKEN]')
    return 0
  }
  const result = await runSmokeChecks(options)
  console.log(JSON.stringify(result))
  return result.status === 'passed' ? 0 : 1
}

if (require.main === module) main().then((code) => { process.exitCode = code }).catch(() => { process.exitCode = 1 })

module.exports = { issuerFromEndpoint, main, parseArgs, runSmokeChecks, validateSmokeEndpoint }
