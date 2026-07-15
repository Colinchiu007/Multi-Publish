// @ts-check
/**
 * recraft.js — Recraft Image Adapter
 *
 * Recraft API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - baseUrl 默认含 /v1 后缀
 * - generateImage: POST /images/generations，请求体 { prompt, model, response_format, size, style }
 *   返回 { images: [{ url }], model, created }
 * - 默认 model 'recraft-v3'，默认 size '1024x1024'
 * - style 可选: 'realism' / 'digital' / 'comic' / 'anime'
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /images/generations
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小图片请求验证
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://external.api.recraft.ai/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'recraft-v3'
const DEFAULT_SIZE = '1024x1024'

// 支持的 style 枚举
const VALID_STYLES = ['realism', 'digital', 'comic', 'anime']

// 静态预定义 Recraft 模型列表（避免不必要的 /models HTTP 请求）
const RECRAFT_MODELS = [
  { id: 'recraft-v3', name: 'Recraft V3', description: '最新 Recraft 模型' },
  { id: 'recraft20b', name: 'Recraft 20B', description: '20B 参数版本' },
]

class RecraftAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Recraft API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点（默认含 /v1）
   * @param {object} [options]
   * @param {number} [options.timeout=120000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：apiKey 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) {
      errors.push('apiKey is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Recraft 使用 Bearer 认证 */
  _headers() {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL（baseUrl 默认含 /v1 后缀） */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, opts = {}) {
    const url = this._url(path)
    const headers = { ...this._headers(), ...(opts.headers || {}) }

    try {
      const response = await fetch(url, {
        ...opts,
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
          || (typeof errorBody === 'string' ? errorBody : `HTTP ${response.status}`)
        throw fromHttpStatus(response.status, message, { providerId: this.id, url })
      }

      return response
    } catch (e) {
      if (e instanceof ProviderError) throw e

      const msg = e.message || String(e)
      if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('aborted')) {
        throw new ProviderError(ERROR_CODES.TIMEOUT, msg, { providerId: this.id })
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
        throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
      }
      throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
    }
  }

  /**
   * POST /images/generations — 图像生成
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='recraft-v3'] - Recraft 模型 ID
   * @param {string} [params.size='1024x1024'] - 图片尺寸
   * @param {string} [params.style] - 风格：realism/digital/comic/anime
   * @param {string} [params.response_format] - 响应格式
   * @returns {Promise<{images: Array<{url}>, model: string, created?: number}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const body = {
      prompt: params.prompt,
      model,
      size: params.size || DEFAULT_SIZE,
    }

    if (params.response_format) body.response_format = params.response_format
    if (params.style) {
      if (!VALID_STYLES.includes(params.style)) {
        throw new ProviderError(
          ERROR_CODES.INVALID_CONFIG,
          `Invalid style: ${params.style}. Must be one of: ${VALID_STYLES.join(', ')}`
        )
      }
      body.style = params.style
    }

    const resp = await this._request('/images/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    return {
      images: data.images || [],
      model: data.model || model,
      created: data.created,
    }
  }

  /**
   * 返回静态预定义的 Recraft 模型列表
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    return RECRAFT_MODELS.map(m => ({ ...m }))
  }

  /**
   * 测试连接 — 通过最小图片请求验证
   */
  async testConnection() {
    try {
      await this._request('/images/generations', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'test',
          model: DEFAULT_MODEL,
          size: DEFAULT_SIZE,
        }),
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { RecraftAdapter, VALID_STYLES, RECRAFT_MODELS }
