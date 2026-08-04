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
  } else if (statusCode === 429) {
    code = ERROR_CODES.RATE_LIMITED
  } else if (hasStrictContentPolicySignal(errorMessage) || hasContentPolicyContextSignal(context)) {
    code = ERROR_CODES.CONTENT_POLICY
  } else {
    code = ERROR_CODES.PROVIDER_ERROR
  }
  return new ProviderError(code, errorMessage, { ...context, statusCode })
}

module.exports = { ProviderError, ERROR_CODES, fromHttpStatus, hasStrictContentPolicySignal }
