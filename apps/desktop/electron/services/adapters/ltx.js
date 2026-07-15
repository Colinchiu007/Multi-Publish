// @ts-check
/**
 * ltx.js — LTX Video 本地服务 Adapter
 *
 * LTX Video 关键特性：
 * - 本地部署服务（默认 http://localhost:8000，可配置）
 * - 无需认证
 * - generateVideo: POST /generate，请求体 { prompt, num_frames: 24, width: 512, height: 512 }
 * - 同步生成模式：直接返回视频文件名，无需轮询
 * - getVideoStatus: 固定返回 completed
 * - testConnection: GET /health
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    同步生成视频
 *   - getVideoStatus()   固定返回 completed
 *   - listModels()       静态预定义列表
 *   - testConnection()   GET /health
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'http://localhost:8000'
const DEFAULT_TIMEOUT = 300000

// 静态预定义模型列表
const LTX_MODELS = [
  { id: 'ltx', name: 'LTX Video', description: 'LTX Video 本地视频生成模型' },
]

class LtxAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 本地服务地址（默认 http://localhost:8000）
   * @param {object} [options]
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 0
  }

  /** 验证配置：baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 无需认证 */
  _headers() {
    return {
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
   * 同步生成视频
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {number} [params.num_frames=24] - 帧数
   * @param {number} [params.width=512] - 视频宽度
   * @param {number} [params.height=512] - 视频高度
   * @returns {Promise<{videoUrl: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const body = {
      prompt: params.prompt,
      num_frames: params.num_frames !== undefined ? params.num_frames : 24,
      width: params.width !== undefined ? params.width : 512,
      height: params.height !== undefined ? params.height : 512,
    }

    const resp = await this._request('/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const filename = data.filename
    if (!filename) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing filename in response', { providerId: this.id })
    }

    return { videoUrl: '/outputs/' + filename, model: 'ltx' }
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
    return LTX_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — GET /health */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/health')
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { LtxAdapter, LTX_MODELS }
