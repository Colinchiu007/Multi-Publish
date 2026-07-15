// @ts-check
/**
 * agnes-video.js — Agnes Video V2.0 Adapter（视频生成）
 *
 * Agnes Video API 关键特性：
 * - 认证头 Authorization: Bearer {key}（sk- 开头密钥）
 * - generateVideo: POST /videos/generations（OpenAI 兼容协议）
 * - 请求体 { model: 'agnes-video-v2.0', prompt, image, width, height, num_frames, frame_rate, negative_prompt, seed }
 * - getVideoStatus: GET /videos/generations/{video_id}（推荐按 video_id 查询）
 * - 异步任务模式：generateVideo 返回 taskId，通过 getVideoStatus 轮询
 *
 * 默认端点 https://apihub.agnes-ai.com/v1，需 API Key。
 * 单模型：agnes-video-v2.0。
 *
 * num_frames 约束：必须满足 8n+1 规则（如 121 = 8*15+1），最大 441。
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交视频生成任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   验证 apiKey 存在
 *   - validateConfig()   apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/TTS/Image 方法（BaseAdapter 默认抛 NotImplementedError）
 * - generateVideo 返回 { taskId, model } 统一格式
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'agnes-video-v2.0'

// 默认参数（121 帧 @ 24fps ≈ 5s）
const DEFAULT_WIDTH = 1152
const DEFAULT_HEIGHT = 768
const DEFAULT_NUM_FRAMES = 121
const DEFAULT_FRAME_RATE = 24

// 静态预定义 Agnes Video 模型列表
const AGNES_VIDEO_MODELS = [
  { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0', description: 'Agnes 视频生成模型' },
]

class AgnesVideoAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Agnes API Key（必填，sk- 开头）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=120000] - 请求超时（ms），视频生成较慢
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：apiKey + baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Agnes 使用 Bearer 认证 */
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
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
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
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='agnes-video-v2.0'] - 模型 ID
   * @param {string} [params.image] - 图生视频的图片 URL
   * @param {number} [params.width=1152] - 视频宽度
   * @param {number} [params.height=768] - 视频高度
   * @param {number} [params.numFrames=121] - 帧数（需满足 8n+1 规则，最大 441）
   * @param {number} [params.frameRate=24] - 帧率
   * @param {string} [params.negativePrompt] - 负向提示词
   * @param {number} [params.seed] - 随机种子
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
      image: params.image || undefined,
      width: params.width || DEFAULT_WIDTH,
      height: params.height || DEFAULT_HEIGHT,
      num_frames: params.numFrames || DEFAULT_NUM_FRAMES,
      frame_rate: params.frameRate || DEFAULT_FRAME_RATE,
      negative_prompt: params.negativePrompt || undefined,
      seed: params.seed || undefined,
    }

    const resp = await this._request('/videos/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // 兼容 OpenAI 协议两种字段命名
    const taskId = data.id || data.task_id
    if (!taskId) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'Missing task id in response',
        { providerId: this.id }
      )
    }

    return { taskId, model }
  }

  /**
   * 查询视频任务状态
   *
   * @param {string} taskId - 任务 ID（即 generateVideo 返回的 video_id）
   * @returns {Promise<{status: string, videoUrl: string, progress: number}>}
   */
  async getVideoStatus(taskId) {
    if (!taskId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'taskId is required')
    }

    const resp = await this._request(`/videos/generations/${taskId}`)
    const data = await resp.json()

    // Agnes 状态映射
    const statusMap = {
      'queued': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
    }
    const status = statusMap[data.status] || 'processing'
    const videoUrl = (status === 'completed' && (data.url || '')) || ''
    const progress = data.progress !== undefined ? Number(data.progress) : (status === 'completed' ? 100 : 0)

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义 Agnes Video 模型列表（副本） */
  async listModels() {
    return AGNES_VIDEO_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 验证 apiKey 存在 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return {
        success: false,
        error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')),
      }
    }
    return { success: true }
  }
}

module.exports = { AgnesVideoAdapter, AGNES_VIDEO_MODELS }
