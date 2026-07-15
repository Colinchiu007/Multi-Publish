// @ts-check
/**
 * runway.js — Runway Video Adapter
 *
 * Runway API 关键特性：
 * - 认证: Bearer token
 * - generateVideo: POST /image_to_video，请求体 { model: 'gen3-alpha', promptText, promptImage }
 * - getVideoStatus: GET /tasks/{taskId}
 * - 异步任务模式：generateVideo 返回 id，通过 getVideoStatus 轮询
 * - 图生视频模式：需要 promptImage 输入
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交图生视频任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.runwayml.com/v1'
const DEFAULT_TIMEOUT = 120000

// 静态预定义模型列表
const RUNWAY_MODELS = [
  { id: 'gen3-alpha', name: 'Gen-3 Alpha', description: 'Runway Gen-3 Alpha 图生视频模型' },
  { id: 'gen2', name: 'Gen-2', description: 'Runway Gen-2 视频生成模型' },
]

class RunwayAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Runway API Key（必填）
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
        const message = (errorBody && errorBody.error)
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
   * 提交图生视频任务
   * @param {object} params
   * @param {string} [params.model='gen3-alpha'] - 模型 ID
   * @param {string} [params.promptText] - 文本提示词
   * @param {string} params.promptImage - 输入图片 URL（必填）
   * @returns {Promise<{taskId: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.promptImage) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.promptImage is required')
    }

    const model = params.model || 'gen3-alpha'
    const body = {
      model,
      promptImage: params.promptImage,
    }
    if (params.promptText !== undefined) body.promptText = params.promptText

    const resp = await this._request('/image_to_video', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const taskId = data.id
    if (!taskId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing id in response', { providerId: this.id })
    }

    return { taskId, model }
  }

  /**
   * 查询视频任务状态
   * @param {string} taskId - 任务 ID
   * @returns {Promise<{status: string, videoUrl: string, progress: number}>}
   */
  async getVideoStatus(taskId) {
    if (!taskId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'taskId is required')
    }

    const resp = await this._request(`/tasks/${taskId}`)
    const data = await resp.json()

    // Runway 状态映射
    const statusMap = {
      'PENDING': 'processing',
      'THROTTLED': 'processing',
      'RUNNING': 'processing',
      'SUCCEEDED': 'completed',
      'FAILED': 'failed',
    }
    const status = statusMap[data.status] || 'processing'
    const videoUrl = (data.output && data.output[0]) || ''
    const progress = data.progress !== undefined ? Number(data.progress) : (status === 'completed' ? 100 : 0)

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return RUNWAY_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/image_to_video', {
        method: 'POST',
        body: JSON.stringify({
          model: 'gen3-alpha',
          promptImage: 'https://example.com/test.png',
          promptText: 'test',
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

module.exports = { RunwayAdapter, RUNWAY_MODELS }
