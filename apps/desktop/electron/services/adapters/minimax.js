// @ts-check
/**
 * minimax.js — MiniMax Video Adapter
 *
 * MiniMax API 关键特性：
 * - 认证: Bearer token
 * - generateVideo: POST /video_generation，请求体含 model/prompt/duration/resolution/first_frame_image/prompt_optimizer
 * - getVideoStatus: GET /query/video_generation?task_id={taskId}
 * - 异步任务模式：generateVideo 返回 task_id，通过 getVideoStatus 轮询
 * - completed 时通过 file_id 调用 /files/retrieve 获取下载 URL
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交视频生成任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'MiniMax-Hailuo-2.3'

// 静态预定义模型列表
const MINIMAX_MODELS = [
  { id: 'MiniMax-Hailuo-2.3', name: 'Hailuo 2.3', description: '最新模型，支持 768P/1080P' },
  { id: 'MiniMax-Hailuo-02', name: 'Hailuo 02', description: '支持 512P/768P/1080P + 首尾帧' },
  { id: 'T2V-01', name: 'T2V-01', description: '文生视频基础模型，720P' },
  { id: 'I2V-01', name: 'I2V-01', description: '图生视频基础模型' },
]

class MiniMaxAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - MiniMax API Key（必填）
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

  /** 构造完整 URL（支持 query 参数） */
  _url(path, queryParams = {}) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    let url = `${base}${path}`
    const entries = Object.entries(queryParams).filter(([_, v]) => v !== undefined && v !== null)
    if (entries.length > 0) {
      const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      url += `?${qs}`
    }
    return url
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, opts = {}) {
    const url = this._url(path, opts.query || {})
    const headers = { ...this._headers(), ...(opts.headers || {}) }
    const fetchOpts = { ...opts }
    delete fetchOpts.query

    try {
      const response = await fetch(url, { ...fetchOpts, headers })

      if (!response.ok) {
        let errorBody
        try { errorBody = await response.json() } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.base_resp && errorBody.base_resp.status_msg)
          || (errorBody && errorBody.message)
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
   * @param {string} [params.model='MiniMax-Hailuo-2.3'] - 模型 ID
   * @param {number} [params.duration=6] - 视频时长（6 或 10 秒）
   * @param {string} [params.resolution='768P'] - 分辨率（512P/720P/768P/1080P）
   * @param {string} [params.firstFrameImage] - 图生视频首帧 URL 或 base64
   * @returns {Promise<{taskId: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const body = {
      model,
      prompt: params.prompt,
      duration: params.duration || 6,
      resolution: params.resolution || '768P',
      first_frame_image: params.firstFrameImage || undefined,
      prompt_optimizer: true,
    }

    const resp = await this._request('/video_generation', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const taskId = data.task_id
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

    const resp = await this._request('/query/video_generation', {
      method: 'GET',
      query: { task_id: taskId },
    })
    const data = await resp.json()

    // MiniMax 状态映射
    const statusMap = {
      'Preparing': 'processing',
      'Queueing': 'processing',
      'Processing': 'processing',
      'Success': 'completed',
      'Fail': 'failed',
    }
    const status = statusMap[data.status] || 'processing'
    // completed 时通过 file_id 调用 /files/retrieve 获取下载 URL（使用配置的 baseUrl）
    const videoUrl = (data.file_id && `${this.credentials.baseUrl.replace(/\/$/, '')}/files/retrieve?file_id=${data.file_id}`) || ''
    const progress = data.progress !== undefined ? Number(data.progress) : (status === 'completed' ? 100 : 0)

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return MINIMAX_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/video_generation', {
        method: 'POST',
        body: JSON.stringify({ model: DEFAULT_MODEL, prompt: 'test' }),
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

module.exports = { MiniMaxAdapter, MINIMAX_MODELS }
