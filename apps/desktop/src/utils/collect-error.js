// @ts-check
/**
 * collect-error.js — 采集错误分类器（纯函数）
 *
 * 把采集链路（Python 聚合层 / Node url-collector / 前端异常）产生的
 * 错误输入归一化为机器可读的 reason，供 UI 层按 detailKey 渲染细分提示。
 *
 * 输入形态：
 *   - string：错误消息文本
 *   - { code, message }：IPC 返回的错误对象
 *   - Error：异常对象（取 message）
 *
 * 分类规则按优先级从上到下匹配，首个命中即返回。
 */

/** 不可重试的分类（参数/输入类错误，重试无意义） */
const NON_RETRYABLE = new Set(['invalid_url', 'internal_url', 'protocol'])

/**
 * 归一化输入为 { message, code }。
 * @param {unknown} input
 * @returns {{ message: string, code: number | undefined }}
 */
function normalizeInput(input) {
  if (typeof input === 'string') {
    return { message: input, code: undefined }
  }
  if (input && typeof input === 'object') {
    const message = input.message != null ? String(input.message) : ''
    const code = typeof input.code === 'number' ? input.code : undefined
    return { message, code }
  }
  return { message: input == null ? '' : String(input), code: undefined }
}

/**
 * 构造分类结果。
 * @param {string} reason
 * @returns {{ reason: string, retryable: boolean, detailKey: string }}
 */
function result(reason) {
  return {
    reason,
    retryable: !NON_RETRYABLE.has(reason),
    detailKey: 'collectErrors.' + reason,
  }
}

/**
 * 分类采集错误。
 * @param {string | { code?: number, message?: string } | Error} input
 * @returns {{ reason: string, retryable: boolean, detailKey: string }}
 */
export function classifyCollectError(input) {
  const { message, code } = normalizeInput(input)

  if (message.includes('无效的 URL') || message.includes('URL 格式不正确') || message.includes('缺少参数')) {
    return result('invalid_url')
  }
  if (message.includes('内网')) return result('internal_url')
  if (message.includes('协议')) return result('protocol')
  if (message.includes('预算')) return result('budget_exhausted')
  if (message.includes('冷却')) return result('cooldown')
  if (message.includes('熔断')) return result('circuit_open')
  if (message.includes('频率受限') || /rate\s?limit/i.test(message) || message.includes('429')) {
    return result('rate_limited')
  }
  if (message.includes('安全验证') || message.includes('百度安全') || /captcha/i.test(message) ||
      (message.includes('登录') && message.includes('验证'))) {
    return result('security_challenge')
  }
  if (message.includes('超时') || /timeout/i.test(message) || message.includes('ETIMEDOUT') || code === -1) {
    return result('timeout')
  }
  if (message.includes('无法访问') || message.includes('不可达') || message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED') || code === -2) {
    return result('unreachable')
  }
  if (message.includes('无结果') || message.includes('无法提取') || code === -4) {
    return result('content_unextractable')
  }
  if ((message.includes('后端') && message.includes('不可用')) || code === -5) {
    return result('backend_unavailable')
  }
  if (/network/i.test(message) || message.includes('ECONNRESET') || message.includes('fetch failed')) {
    return result('network_error')
  }
  return result('unknown')
}
