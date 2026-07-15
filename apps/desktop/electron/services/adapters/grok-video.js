// @ts-check
/**
 * grok-video.js — xAI Grok Video Adapter
 *
 * xAI Grok Video API 关键特性：
 * - 认证: Bearer token
 * - generateVideo: POST /video/generations，请求体 { model: 'grok-video', prompt }
 * - 同步生成模式：直接返回 videoUrl，无需轮询
 * - getVideoStatus 直接返回 completed
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    同步生成视频（返回 videoUrl）
 *   - getVideoStatus()   固定返回 completed（同步模式无需轮询）
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_TIMEOUT = 120000

// 静态预定义模型列表
const GROK_VIDEO_MODELS = [
  { id: 'grok-video', name: 'Grok Video', description: 'xAI Grok 视频生成模型' },
]

class GrokVideoAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - xAI API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
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
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Bearer 认证 */
  _headers() {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL */
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
      const response = await fetch(url, { ...opts, headers })

      if (!response.ok) {
        let errorBody
        try { errorBody = await response.json() } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.error && errorBody.error.message)
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
   * 同步生成视频
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='grok-video'] - 模型 ID
   * @returns {Promise<{videoUrl: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || 'grok-video'
    const body = {
      model,
      prompt: params.prompt,
    }

    const resp = await this._request('/video/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const videoUrl = data.url
    if (!videoUrl) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing url in response', { providerId: this.id })
    }

    return { videoUrl, model }
  }

  /**
   * 同步模式无需轮询，直接返回 completed
   * @returns {Promise<{status: string}>}
   */
  async getVideoStatus() {
    return { status: 'completed', videoUrl: '', progress: 100 }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return GROK_VIDEO_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/video/generations', {
        method: 'POST',
        body: JSON.stringify({ model: 'grok-video', prompt: 'test' }),
      })
      return { success: true }
    } catch (e) {
      if (e instanceof ProviderError && (e.code === ERROR_CODES.RATE_LIMITED || e.code === ERROR_CODES.PROVIDER_ERROR)) {
        return { success: true }
      }
      return { success: false, error: e }
    }
  }
}

module.exports = { GrokVideoAdapter, GROK_VIDEO_MODELS }
