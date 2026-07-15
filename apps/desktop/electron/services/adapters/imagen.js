// @ts-check
/**
 * imagen.js — Google Imagen Image Adapter
 *
 * Google Imagen API 关键特性：
 * - 认证：API Key 作为 query param（?key=xxx）
 * - baseUrl: https://generativelanguage.googleapis.com
 * - generateImage: POST /v1beta/models/imagen-3:predict?key=xxx
 *   请求体 { instances: [{ prompt }], parameters: { sampleCount: 1 } }
 *   原始返回 { predictions: [{ bytesBase64Encoded, mimeType }] }
 *   转换为统一格式 { images: [{ b64_json }], model: 'imagen-3' }
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /v1beta/models/imagen-3:predict
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小预测请求验证
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'imagen-3'

// 静态预定义 Imagen 模型列表
const IMAGEN_MODELS = [
  { id: 'imagen-3', name: 'Imagen 3', description: 'Google Imagen 3 模型' },
  { id: 'imagen-3-fast', name: 'Imagen 3 Fast', description: '快速版本' },
]

class ImagenAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Google API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
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

  /** 构造请求头 — Imagen 使用 API Key query param，无需 Authorization 头 */
  _headers() {
    return {
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL — Imagen 把 API Key 拼到 query param */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    const sep = path.includes('?') ? '&' : '?'
    return `${base}${path}${sep}key=${encodeURIComponent(this.credentials.apiKey)}`
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
   * POST /v1beta/models/imagen-3:predict — 图像生成
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='imagen-3'] - Imagen 模型 ID
   * @param {number} [params.sampleCount=1] - 生成数量
   * @returns {Promise<{images: Array<{b64_json}>, model: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const sampleCount = params.sampleCount || 1
    const body = {
      instances: [{ prompt: params.prompt }],
      parameters: { sampleCount },
    }

    const resp = await this._request(`/v1beta/models/${model}:predict`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // Imagen 返回 predictions: [{ bytesBase64Encoded, mimeType }]
    // 转换为统一格式 images: [{ b64_json }]
    const predictions = data.predictions || []
    const images = predictions.map(p => ({
      b64_json: p.bytesBase64Encoded,
      mimeType: p.mimeType,
    }))

    return {
      images,
      model,
    }
  }

  /**
   * 返回静态预定义的 Imagen 模型列表
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    return IMAGEN_MODELS.map(m => ({ ...m }))
  }

  /**
   * 测试连接 — 通过最小预测请求验证
   */
  async testConnection() {
    try {
      await this._request(`/v1beta/models/${DEFAULT_MODEL}:predict`, {
        method: 'POST',
        body: JSON.stringify({
          instances: [{ prompt: 'test' }],
          parameters: { sampleCount: 1 },
        }),
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { ImagenAdapter, IMAGEN_MODELS }
