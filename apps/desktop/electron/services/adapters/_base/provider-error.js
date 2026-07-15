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
  PROVIDER_ERROR:  { category: 'provider', retryable: true },
  NOT_IMPLEMENTED: { category: 'system',   retryable: false },
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
 * fromHttpStatus — HTTP 状态码映射到 ProviderError
 *
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误消息
 * @param {object} [context={}] - 附加上下文
 * @returns {ProviderError}
 */
function fromHttpStatus(status, message, context = {}) {
  let code
  if (status === 0) {
    // ETIMEDOUT / ECONNREFUSED 等 Node.js 网络错误
    code = (message.includes('ETIMEDOUT') || message.includes('timeout'))
      ? ERROR_CODES.TIMEOUT
      : ERROR_CODES.NETWORK_ERROR
  } else if (status === 401 || status === 403) {
    code = ERROR_CODES.AUTH_FAILED
  } else if (status === 429) {
    code = ERROR_CODES.RATE_LIMITED
  } else if (status >= 500) {
    code = ERROR_CODES.PROVIDER_ERROR
  } else {
    code = ERROR_CODES.PROVIDER_ERROR
  }
  return new ProviderError(code, message, { ...context, statusCode: status })
}

module.exports = { ProviderError, ERROR_CODES, fromHttpStatus }
