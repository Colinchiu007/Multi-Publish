// @ts-check
/**
 * auth-diagnostics.js — 身份失败判定与诊断输出的纯函数集合
 *
 * 从 `auth-service.js` 抽出（2026-09-14）：该文件已接近 500 行债务阈值，
 * 而这些函数彼此独立、无状态、可单独测试，抽出后 auth-service 只保留状态机。
 *
 * 为什么需要诊断输出：2026-09-14 的登录事故中，状态机只保留了「清理失败」，
 * 真正的失败原因（宿主 safe-delete shim 拦截 `fs.unlink`）被完全吞掉，
 * 现场只能靠猜，排查耗时以小时计。凡失败分支都应落 `scope + code + cause 链`。
 */

/**
 * 诊断报告脱敏。
 *
 * 复用 `ipc-handlers/account.js` 的 `toPublicErrorValue` 同款正则，
 * 而非另写一套：两套脱敏规则迟早会漂，届时用户粘出去的"已脱敏"报告
 * 可能含明文令牌。宁可抽公共模块，也不要复制正则。
 */
const SECRET_ASSIGNMENT_RE = /((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|access[_-]?key|app[_-]?secret|session(?:[_-]?id)?|pwd|passwd|token|cookie|password|secret|authorization|令牌|密钥|密码)\s*[:=：]\s*)(?:Bearer\s+)?[^\s,;]+(?:,[^\s,;]+)*/gi
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~-]+(?:,[A-Za-z0-9._~-]+)*/gi
const MAX_DIAGNOSTIC_FIELD = 240

/** 把任意值压成可安全外发的短字符串。 */
function toDiagnosticText(value, maxLength = MAX_DIAGNOSTIC_FIELD) {
  if (value === null || value === undefined) return ''
  let text
  if (typeof value === 'string') text = value
  else if (typeof value === 'object') {
    // 只留可辨识的浅层摘要，深层对象不展开，避免带出账号数据
    try {
      text = Object.entries(value)
        .slice(0, 6)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? '[obj]' : String(v)}`)
        .join(' ')
    } catch {
      text = '[unserializable]'
    }
  } else text = String(value)

  const redacted = text
    .replace(SECRET_ASSIGNMENT_RE, '$1***')
    .replace(BEARER_RE, 'Bearer ***')
  return redacted.length > maxLength ? redacted.slice(0, maxLength) + '…' : redacted
}

/**
 * 汇总错误对象及其 cause 链上的 code/message（小写），用于关键字判定。
 * @param {unknown} error
 * @returns {string}
 */
function errorSignals(error) {
  const values = []
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code) values.push(String(current.code).toLowerCase())
    if (current.message) values.push(String(current.message).toLowerCase())
    current = current.cause
  }
  return values.join(' ')
}

/**
 * 网络失败 → 具体错误码。
 *
 * 为什么细分：`IDENTITY_NETWORK_UNAVAILABLE` 一个码覆盖所有网络失败，
 * 用户拿到的永远是笼统的「网络暂时不可用，请稍后重试」——而不同原因要给的
 * 建议完全相反：TLS 被拦截该找 IT 加白名单，DNS 失败该查网络/路由器，
 * 超时该等。细分码让前端能给出**可执行**的引导，而不是把排障成本推给用户。
 *
 * 未识别到具体原因时回落到 IDENTITY_NETWORK_UNAVAILABLE（不制造新码）。
 */
const NETWORK_ERROR_CODES = Object.freeze({
  tls: 'IDENTITY_NETWORK_TLS_BLOCKED',
  dns: 'IDENTITY_NETWORK_DNS_FAILED',
  timeout: 'IDENTITY_NETWORK_TIMEOUT',
  proxy: 'IDENTITY_NETWORK_PROXY_BLOCKED',
  connection: 'IDENTITY_NETWORK_UNAVAILABLE',
})

/**
 * 取网络失败对应的错误码（非网络错误返回 null）。
 * @param {unknown} error
 * @returns {string|null}
 */
function networkErrorCode(error) {
  if (!isNetworkError(error)) return null
  return NETWORK_ERROR_CODES[classifyNetworkError(error)] || 'IDENTITY_NETWORK_UNAVAILABLE'
}

/**
 * 网络类失败特征码 / 关键字。
 *
 * 补 TLS 与连接中断的原因（2026-10-07）：原表只含 DNS/连接/超时一类，
 * 导致企业 HTTPS 中间人拦截（自签 CA / 证书过期 / 域名不匹配）全部漏判。
 * 漏判的代价不是文案不准，而是**行为错了** —— `auth-service.getAccessToken`
 * 会跳过 `offline_authenticated` 离线宽限分支，直接落到兜底的 `status: 'error'`，
 * 用户看到「暂时无法获取访问凭证」，且反复重试可能触发风控。
 * 证书类失败的根因几乎都在本机网络环境，**必须**按可恢复的网络问题处理。
 */
const NETWORK_SIGNALS = [
  // DNS / 连接 / 超时（原表）
  'network', 'fetch failed', 'econnreset', 'econnrefused', 'enotfound',
  'eai_again', 'etimedout', 'timeout',
  // TLS 握手与证书校验（企业代理 / 杀毒软件 HTTPS 扫描高发）
  'econnaborted', 'eproto', 'ecryptio', 'esockettimedout',
  'unable_to_verify_leaf_signature', 'unable_to_get_issuer_cert',
  'unable_to_get_issuer_cert_locally', 'self_signed_cert_in_chain',
  'depth_zero_self_signed_cert', 'cert_has_expired',
  'err_tls_cert_altname_invalid', 'err_ssl_wrong_version_number',
  'certificate has expired', 'unable to verify the first certificate',
  'self signed certificate', 'self-signed certificate',
  // undici（Node 18+ fetch）连接中断
  'und_err_socket', 'und_err_connect_timeout', 'und_err_headers_timeout',
]

/**
 * 是否可判定为网络类失败（决定「离线宽限」与「保留本地凭证」）。
 * @param {unknown} error
 * @returns {boolean}
 */
function isNetworkError(error) {
  const value = errorSignals(error)
  return NETWORK_SIGNALS.some((signal) => value.includes(signal))
}

/**
 * 进一步细分网络失败，用于选择**可执行的引导**。
 * 只做定性归类，不做归因：TLS 类只说明「安全连接建立不起来」，
 * 具体是自签 CA、证书过期还是域名不匹配，要靠下面的 code 才能判断。
 * @param {unknown} error
 * @returns {'tls' | 'proxy' | 'offline' | 'dns' | 'timeout' | 'connection'}
 */
function classifyNetworkError(error) {
  const value = errorSignals(error)
  const has = (...list) => list.some((signal) => value.includes(signal))
  if (has('econnrefused', 'und_err_socket', 'econnaborted')) return 'connection'
  if (has('enotfound', 'eai_again', 'getaddrinfo')) return 'dns'
  if (has('etimedout', 'esockettimedout', 'timeout', 'und_err_connect_timeout', 'und_err_headers_timeout')) return 'timeout'
  if (has('econnreset')) return has('proxy') ? 'proxy' : 'connection'
  if (has(
    'unable_to_verify_leaf_signature', 'unable_to_get_issuer_cert',
    'unable_to_get_issuer_cert_locally', 'self_signed_cert_in_chain',
    'depth_zero_self_signed_cert', 'cert_has_expired',
    'err_tls_cert_altname_invalid', 'err_ssl_wrong_version_number',
    'eproto', 'ecryptio',
    'certificate has expired', 'self signed certificate', 'self-signed certificate',
    'unable to verify the first certificate',
  )) return 'tls'
  return 'connection'
}

/**
 * 是否可判定为「服务端明确拒绝会话」（决定是否清理本地凭证）。
 * @param {unknown} error
 * @returns {boolean}
 */
function isSessionRejected(error) {
  const value = errorSignals(error)
  return ['invalid_grant', 'not_authenticated', 'token_revoked', 'session_expired']
    .some((signal) => value.includes(signal))
}

/**
 * ID Token 是否已过期。
 * @param {{ exp?: number } | null | undefined} claims
 * @param {number} now
 * @returns {boolean}
 */
function claimsExpired(claims, now) {
  return Boolean(claims && Number.isFinite(claims.exp) && claims.exp <= now)
}

/**
 * 生成可读的 cause 链描述，如 `IDENTITY_SIGN_IN_FAILED: 登录失败 <- Error: unlink denied`。
 * @param {unknown} error
 * @param {number} [maxDepth]
 * @returns {string}
 */
function describeErrorChain(error, maxDepth = 5) {
  const chain = []
  let current = error
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    const code = current.code || current.name || 'Error'
    chain.push(code + ': ' + (current.message || ''))
    current = current.cause
  }
  return chain.join(' <- ')
}

/**
 * 组装一份可安全外发的诊断报告。
 *
 * 为什么必须脱敏：用户会把它粘进 issue / 客服工单 / 聊天窗口，
 * 而 `describeErrorChain` 的原始输出包含 SDK 抛出的完整 message，
 * 其中可能夹带 endpoint 的 query 参数或令牌片段。
 *
 * @param {object} [context]
 * @param {unknown} [context.error] 触发诊断的错误对象
 * @param {string} [context.status] 当前身份状态
 * @param {Record<string, unknown>} [context.env] 环境信息（客户端版本、OS、网络类型等）
 * @returns {{ text: string, fields: Array<[string, string]> }}
 */
function buildDiagnosticReport(context = {}) {
  const { error = null, status = '', env = {} } = context
  const fields = [
    ['时间', new Date().toISOString()],
    ['状态', toDiagnosticText(status, 40)],
    ['错误码', toDiagnosticText(error && error.code, 80)],
    ['错误摘要', toDiagnosticText(error && error.message, MAX_DIAGNOSTIC_FIELD)],
  ]

  const envKeys = ['appVersion', 'platform', 'arch', 'networkType', 'proxyDetected', 'endpointHost']
  for (const key of envKeys) {
    if (env[key] !== undefined && env[key] !== null && env[key] !== '') {
      fields.push([key, toDiagnosticText(env[key], 120)])
    }
  }

  if (error) {
    fields.push(['错误链', toDiagnosticText(describeErrorChain(error), 600)])
  }

  const text = fields.map(([k, v]) => `${k}: ${v}`).join('\n')
  return { text, fields }
}

/**
 * 落一条身份失败诊断日志。日志失败绝不影响身份流程本身。
 * @param {{ warn?: (module: string, message: string, meta?: unknown) => void } | null} logger
 * @param {string} scope
 * @param {unknown} error
 * @param {Record<string, unknown>} [extra]
 */
function logIdentityFailure(logger, scope, error, extra = {}) {
  if (!logger || typeof logger.warn !== 'function') return
  try {
    logger.warn('Identity', scope + ' failed: ' + describeErrorChain(error), extra)
  } catch { /* 日志失败不影响身份流程 */ }
}

module.exports = {
  errorSignals,
  isNetworkError,
  classifyNetworkError,
  isSessionRejected,
  claimsExpired,
  describeErrorChain,
  logIdentityFailure,
  buildDiagnosticReport,
  toDiagnosticText,
  networkErrorCode,
  NETWORK_ERROR_CODES,
  NETWORK_SIGNALS,
}
