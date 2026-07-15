// @ts-check
/**
 * suno.js — Suno 音乐生成 Adapter
 *
 * Suno API 关键特性：
 * - 认证: Bearer token
 * - generateMusic: POST /music/generations，请求体 { prompt, model: 'suno-v4', duration }
 *   （自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加）
 * - 返回 { audioUrl, model }
 *
 * 实现的方法（capabilities）：
 *   - generateMusic()   生成音乐（自定义方法）
 *   - listModels()      静态预定义列表
 *   - testConnection()  通过最小请求验证
 *
 * 注意：generateMusic 不在 BaseAdapter.KNOWN_METHODS 中，
 *       supports() 默认返回 false，需在 capabilities() 中手动添加。
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.suno.ai/v1'
const DEFAULT_TIMEOUT = 120000

// 静态预定义模型列表
const SUNO_MODELS = [
  { id: 'suno-v4', name: 'Suno v4', description: 'Suno v4 音乐生成模型' },
  { id: 'suno-v3.5', name: 'Suno v3.5', description: 'Suno v3.5 音乐生成模型' },
]

class SunoAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Suno API Key（必填）
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
   * 生成音乐
   * 自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='suno-v4'] - 模型 ID
   * @param {number} [params.duration] - 时长（秒）
   * @returns {Promise<{audioUrl: string, model: string}>}
   */
  async generateMusic(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || 'suno-v4'
    const body = {
      prompt: params.prompt,
      model,
    }
    if (params.duration !== undefined) body.duration = params.duration

    const resp = await this._request('/music/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const audioUrl = data.audio_url || (data.data && data.data.audio_url) || ''
    if (!audioUrl) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing audio_url in response', { providerId: this.id })
    }

    return { audioUrl, model }
  }

  /**
   * 覆盖 capabilities() — 在自动扫描基础上手动添加 generateMusic
   * 因为 generateMusic 不在 KNOWN_METHODS 中，supports() 检测不到
   */
  capabilities() {
    const caps = super.capabilities()
    if (!caps.includes('generateMusic')) caps.push('generateMusic')
    return caps
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return SUNO_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小请求验证 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/music/generations', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'test', model: 'suno-v4' }),
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

module.exports = { SunoAdapter, SUNO_MODELS }
