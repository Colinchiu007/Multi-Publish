// @ts-check
/**
 * veo.js — Google Veo Video Adapter
 *
 * Google Veo API 关键特性：
 * - 认证: API Key（query param ?key=xxx 或 x-goog-api-key header）
 * - generateVideo: POST /v1beta/models/veo:predictLongRunning，请求体 { instances: [{ prompt }], parameters: { sampleCount: 1 } }
 * - getVideoStatus: GET /v1beta/{jobId}
 * - 异步任务模式：generateVideo 返回 name（jobId），通过 getVideoStatus 轮询
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交长运行视频生成任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_TIMEOUT = 120000

// 静态预定义模型列表
const VEO_MODELS = [
  { id: 'veo', name: 'Google Veo', description: 'Google Veo 视频生成模型' },
  { id: 'veo-2.0', name: 'Veo 2.0', description: 'Google Veo 2.0 增强版' },
]

class VeoAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Google API Key（必填）
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

  /** 构造请求头 — Google API 使用 x-goog-api-key */
  _headers() {
    return {
      'x-goog-api-key': this.credentials.apiKey,
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL（自动附加 key 参数作为备用认证） */
  _url(path, includeKey = true) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    const url = `${base}${path}`
    if (includeKey && this.credentials.apiKey) {
      const sep = url.includes('?') ? '&' : '?'
      return `${url}${sep}key=${encodeURIComponent(this.credentials.apiKey)}`
    }
    return url
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, opts = {}, includeKey = true) {
    const url = this._url(path, includeKey)
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
   * 提交长运行视频生成任务
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {number} [params.sampleCount=1] - 生成样本数
   * @returns {Promise<{jobId: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const body = {
      instances: [{ prompt: params.prompt }],
      parameters: {
        sampleCount: params.sampleCount !== undefined ? params.sampleCount : 1,
      },
    }

    const resp = await this._request('/v1beta/models/veo:predictLongRunning', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const jobId = data.name
    if (!jobId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing name in response', { providerId: this.id })
    }

    return { jobId, model: 'veo' }
  }

  /**
   * 查询长运行任务状态
   * @param {string} jobId - 任务 ID（即 name 字段）
   * @returns {Promise<{status: string, videoUrl: string, progress: number}>}
   */
  async getVideoStatus(jobId) {
    if (!jobId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'jobId is required')
    }

    const resp = await this._request(`/v1beta/${jobId}`)
    const data = await resp.json()

    // Google LRO 状态映射
    const done = data.done === true
    const hasError = data.error && data.error.code
    let status = 'processing'
    if (hasError) status = 'failed'
    else if (done) status = 'completed'

    // 视频输出在 response.generatedSamples[].video.uri
    let videoUrl = ''
    if (data.response && data.response.generatedSamples) {
      videoUrl = data.response.generatedSamples[0] && data.response.generatedSamples[0].video
        && data.response.generatedSamples[0].video.uri || ''
    }
    const progress = status === 'completed' ? 100 : 0

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return VEO_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/v1beta/models/veo:predictLongRunning', {
        method: 'POST',
        body: JSON.stringify({
          instances: [{ prompt: 'test' }],
          parameters: { sampleCount: 1 },
        }),
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

module.exports = { VeoAdapter, VEO_MODELS }
