// @ts-check
/**
 * wan.js — 阿里万相 Wan Video Adapter
 *
 * 阿里万相 API 关键特性：
 * - 认证: Bearer token（阿里云 DashScope API Key）
 * - generateVideo: POST /services/video-generation/video-synthesis，请求体 { model: 'wan-video', input: { prompt } }
 * - getVideoStatus: GET /tasks/{taskId}
 * - 异步任务模式：generateVideo 返回 task_id，通过 getVideoStatus 轮询
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交视频生成任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'
const DEFAULT_TIMEOUT = 120000

// 静态预定义模型列表
const WAN_MODELS = [
  { id: 'wan-video', name: 'Wan Video', description: '阿里万相视频生成模型' },
  { id: 'wanx2.1', name: 'Wanx 2.1', description: '万相 2.1 视频生成模型' },
]

class WanAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - 阿里云 DashScope API Key（必填）
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
        const message = (errorBody && errorBody.message)
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
   * 提交视频生成任务
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='wan-video'] - 模型 ID
   * @returns {Promise<{taskId: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || 'wan-video'
    const body = {
      model,
      input: { prompt: params.prompt },
    }

    const resp = await this._request('/services/video-generation/video-synthesis', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const taskId = data.output && data.output.task_id
    if (!taskId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing task_id in response', { providerId: this.id })
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
    const output = data.output || {}

    // 阿里云状态映射
    const statusMap = {
      'PENDING': 'processing',
      'RUNNING': 'processing',
      'SUCCEEDED': 'completed',
      'FAILED': 'failed',
      'UNKNOWN': 'processing',
    }
    const status = statusMap[output.task_status] || 'processing'
    const videoUrl = (output.video_url) || ''
    const progress = output.task_metrics && output.task_metrics.total !== undefined
      ? Math.floor((output.task_metrics.succeeded / output.task_metrics.total) * 100)
      : (status === 'completed' ? 100 : 0)

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return WAN_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/services/video-generation/video-synthesis', {
        method: 'POST',
        body: JSON.stringify({
          model: 'wan-video',
          input: { prompt: 'test' },
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

module.exports = { WanAdapter, WAN_MODELS }
