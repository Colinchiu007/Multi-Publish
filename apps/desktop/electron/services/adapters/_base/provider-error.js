// @ts-check
/**
 * provider-error.js — P3.0 统一错误类型
 *
 * 设计决策（devex review 3.1/3.5）：
 * - testConnection 返回 ProviderError 而非裸字符串
 * - 包含 code/category/retryable/context 4 个维度
 * - ERROR_CODES 常量字典防止拼写错误
 * - fromHttpStatus 映射 HTTP 状态码到错误类型
 */

/**
 * ERROR_CODES — 错误码常量字典
 * 使用大写+SNAKE_CASE，防止拼写错误
 */
const ERROR_CODES = Object.freeze({
  AUTH_FAILED: 'AUTH_FAILED',         // 401/403 认证失败
  RATE_LIMITED: 'RATE_LIMITED',       // 429 限流
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',   // 402/额度不足（余额、token 套餐额度耗尽）
  TIMEOUT: 'TIMEOUT',                 // 请求超时
  NETWORK_ERROR: 'NETWORK_ERROR',     // 网络错误（DNS/连接失败）
  INVALID_CONFIG: 'INVALID_CONFIG',   // 配置无效（缺 API Key 等）
  PROVIDER_ERROR: 'PROVIDER_ERROR',   // 供应商内部错误（500）
  CONTENT_POLICY: 'CONTENT_POLICY', // 可明确识别的内容安全拒绝
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // 方法未实现
})

/**
 * ERROR_META — 错误码元数据（category + retryable）
 * category: auth/rate/network/config/provider/system
 * retryable: 是否值得重试（401 不可重试，429 可重试）
 */
const ERROR_META = {
  AUTH_FAILED:     { category: 'auth',     retryable: false },
  RATE_LIMITED:    { category: 'rate',     retryable: true },
  QUOTA_EXCEEDED:  { category: 'quota',    retryable: false },
  TIMEOUT:         { category: 'network',  retryable: true },
  NETWORK_ERROR:   { category: 'network',  retryable: true },
  INVALID_CONFIG:  { category: 'config',   retryable: false },
  PROVIDER_ERROR:  { category: 'provider',       retryable: true },
  CONTENT_POLICY:  { category: 'content_policy', retryable: false },
  NOT_IMPLEMENTED: { category: 'system',         retryable: false },
}

/**
 * ProviderError — 统一供应商错误类型
 *
 * @example
 *   throw new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid API key', {
 *     providerId: 'openai', statusCode: 401
 *   })
 */
class ProviderError extends Error {
  constructor(code, message, context = {}) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    const meta = ERROR_META[code] || { category: 'unknown', retryable: false }
    this.category = meta.category
    this.retryable = meta.retryable
    this.context = context
  }

  toString() {
    return `[${this.code}] ${this.message}`
  }
}

/**
 * 只识别供应商稳定的内容安全标识；普通说明或裸 400/403 都不能触发内容策略重试。
 */
function hasStrictContentPolicySignal(value) {
  const signal = String(value || '').trim()
  if (!signal) return false
  const normalized = signal.toLowerCase().replace(/[\s-]+/g, '_')
  if ([
    'content_policy',
    'content_policy_violation',
    'content_filter',
    'safety_filter',
    'safety_violation',
    'moderation_blocked',
    'moderation_flagged',
    'moderation_rejected',
  ].includes(normalized)) return true

  return /\b(?:blocked|rejected|filtered)\b[^\n]{0,120}\bcontent(?:[_\s-]+)policy\b/i.test(signal) ||
    /\bcontent(?:[_\s-]+)policy\b[^\n]{0,120}\b(?:blocked|rejected|filtered)\b/i.test(signal) ||
    /\brejected as a result of (?:our )?safety system\b/i.test(signal)
}

function hasContentPolicyContextSignal(context) {
  if (!context || typeof context !== 'object') return false
  if (context.contentPolicy === true || context.content_policy === true) return true
  return [
    context.providerCode,
    context.provider_code,
    context.errorCode,
    context.error_code,
    context.type,
    context.error?.code,
    context.error?.type,
  ].some(hasStrictContentPolicySignal)
}

/**
 * fromHttpStatus — HTTP 状态码映射到 ProviderError
 *
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误消息
 * @param {object} [context={}] - 附加上下文
 * @returns {ProviderError}
 */
function fromHttpStatus(status, message, context = {}) {
  const statusCode = Number(status)
  const errorMessage = typeof message === 'string' ? message : String(message || '')
  let code
  // Authentication, rate-limit and transport failures must never be retried as
  // content-policy rejections just because a provider reuses an unsafe-looking
  // message or nested code in its error payload.
  if (statusCode === 0) {
    // ETIMEDOUT / ECONNREFUSED 等 Node.js 网络错误
    code = (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout'))
      ? ERROR_CODES.TIMEOUT
      : ERROR_CODES.NETWORK_ERROR
  } else if (statusCode === 401 || statusCode === 403) {
    code = ERROR_CODES.AUTH_FAILED
  } else if (statusCode === 402) {
    code = ERROR_CODES.QUOTA_EXCEEDED
  } else if (statusCode === 429) {
    code = ERROR_CODES.RATE_LIMITED
  } else if (hasStrictContentPolicySignal(errorMessage) || hasContentPolicyContextSignal(context)) {
    code = ERROR_CODES.CONTENT_POLICY
  } else {
    code = ERROR_CODES.PROVIDER_ERROR
  }
  return new ProviderError(code, errorMessage, { ...context, statusCode })
}

const RATE_LIMIT_MESSAGE_PATTERN = /\brate[_\s-]?limit\b|too\s+many\s+requests|限流|请求频率|rate_limit/i
const QUOTA_MESSAGE_PATTERN = /\b(?:insufficient|exhausted|exceeded|out\s+of)\b[^\n]{0,40}\b(?:quota|balance|token|credit)s?\b|(?:quota|balance|token|credit)s?[^\n]{0,40}\b(?:exceeded|insufficient|exhausted)\b|(?:余额|额度|配额|点数)[^\n]{0,20}(?:不足|不够|超过|超限|耗尽)|insufficient\s+balance|billing|payment\s+required/i

/**
 * 统一把 provider 失败归类为五类，供限流/排队/重试网关决策：
 * - 'rate'           → 触发频率限制（429 / RATE_LIMITED），可等待冷却后重试
 * - 'quota'          → 额度/余额/套餐配额耗尽（402 / QUOTA_EXCEEDED），不重试，需用户处理
 * - 'transient'      → 超时/网络抖动，可短退避重试
 * - 'content_policy' → 明确内容安全拒绝，进入改写/人工处理流程
 * - 'other'          → 其余错误，不重试
 */
function classifyProviderFailure(error) {
  if (!error || typeof error !== 'object') return 'other'
  const message = String(error.message || error.error || error.msg || '')
  const statusCode = Number(error.statusCode ?? error.status ?? error.context?.statusCode)
  const code = error.code || error.context?.code

  if (statusCode === 429 || code === ERROR_CODES.RATE_LIMITED) return 'rate'
  if (statusCode === 402 || code === ERROR_CODES.QUOTA_EXCEEDED) return 'quota'
  if (code === ERROR_CODES.TIMEOUT || code === ERROR_CODES.NETWORK_ERROR) return 'transient'
  if (code === ERROR_CODES.CONTENT_POLICY) return 'content_policy'

  if (RATE_LIMIT_MESSAGE_PATTERN.test(message)) return 'rate'
  if (QUOTA_MESSAGE_PATTERN.test(message)) return 'quota'
  if (/\btimed?\s*out\b|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network\s*error|超时|网络/i.test(message)) return 'transient'
  if (hasStrictContentPolicySignal(message) || hasContentPolicyContextSignal(error.context || error)) return 'content_policy'
  return 'other'
}

module.exports = { ProviderError, ERROR_CODES, fromHttpStatus, hasStrictContentPolicySignal, classifyProviderFailure, RATE_LIMIT_MESSAGE_PATTERN, QUOTA_MESSAGE_PATTERN }
