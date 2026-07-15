// @ts-check
/**
 * musicgen.js — MusicGen 本地服务 Adapter
 *
 * MusicGen 关键特性：
 * - 本地部署服务（默认 http://localhost:5000，可配置）
 * - 无需认证
 * - generateMusic: POST /generate，请求体 { prompt, model: 'musicgen', duration }
 *   （自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加）
 * - 返回 { audioUrl: '/output.wav', model }
 * - testConnection: GET /health
 *
 * 实现的方法（capabilities）：
 *   - generateMusic()   生成音乐（自定义方法）
 *   - listModels()      静态预定义列表
 *   - testConnection()  GET /health
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'http://localhost:5000'
const DEFAULT_TIMEOUT = 300000

// 静态预定义模型列表
const MUSICGEN_MODELS = [
  { id: 'musicgen', name: 'MusicGen', description: 'Meta MusicGen 本地音乐生成模型' },
  { id: 'musicgen-small', name: 'MusicGen Small', description: 'MusicGen 小模型（快速）' },
  { id: 'musicgen-medium', name: 'MusicGen Medium', description: 'MusicGen 中等模型' },
  { id: 'musicgen-large', name: 'MusicGen Large', description: 'MusicGen 大模型（高质量）' },
]

class MusicGenAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 本地服务地址（默认 http://localhost:5000）
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
   * 生成音乐
   * 自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='musicgen'] - 模型 ID
   * @param {number} [params.duration] - 时长（秒）
   * @returns {Promise<{audioUrl: string, model: string}>}
   */
  async generateMusic(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || 'musicgen'
    const body = {
      prompt: params.prompt,
      model,
    }
    if (params.duration !== undefined) body.duration = params.duration

    const resp = await this._request('/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    // MusicGen 本地服务接受请求即可，audioUrl 固定 /output.wav
    await resp.json().catch(() => ({}))

    return { audioUrl: '/output.wav', model }
  }

  /**
   * 覆盖 capabilities() — 在自动扫描基础上手动添加 generateMusic
   */
  capabilities() {
    const caps = super.capabilities()
    if (!caps.includes('generateMusic')) caps.push('generateMusic')
    return caps
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return MUSICGEN_MODELS.map(m => ({ ...m }))
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

module.exports = { MusicGenAdapter, MUSICGEN_MODELS }
