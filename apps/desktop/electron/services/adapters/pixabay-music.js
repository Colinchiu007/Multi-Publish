// @ts-check
/**
 * pixabay-music.js — Pixabay 音乐搜索 Adapter
 *
 * Pixabay API 关键特性：
 * - 认证: API Key 作为 query param ?key=xxx
 * - searchMusic: GET /?key=xxx&type=music&q=keyword
 *   （自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加）
 * - 返回 { tracks: [{ url, title, duration }], total }
 * - testConnection: GET /?key=xxx&type=music&q=test
 *
 * 实现的方法（capabilities）：
 *   - searchMusic()    搜索音乐（自定义方法）
 *   - listModels()     静态预定义列表（音乐搜索无模型概念）
 *   - testConnection() GET /?key=xxx&type=music&q=test
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://pixabay.com/api/'
const DEFAULT_TIMEOUT = 30000

// 静态预定义模型列表（音乐搜索服务无模型概念，返回占位）
const PIXABAY_MODELS = [
  { id: 'pixabay-music', name: 'Pixabay Music', description: 'Pixabay 免费音乐搜索服务' },
]

class PixabayMusicAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Pixabay API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 1
  }

  /** 验证配置：apiKey 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Pixabay 用 query param，无需 Authorization 头 */
  _headers() {
    return {
      'Accept': 'application/json',
    }
  }

  /** 构造完整 URL（含 query 参数） */
  _url(queryParams = {}) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    const params = {
      key: this.credentials.apiKey,
      type: 'music',
      ...queryParams,
    }
    const entries = Object.entries(params).filter(([_, v]) => v !== undefined && v !== null)
    const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    return `${base}/?${qs}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(queryParams = {}) {
    const url = this._url(queryParams)
    const headers = this._headers()

    try {
      const response = await fetch(url, { method: 'GET', headers })

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
   * 搜索音乐
   * 自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加
   *
   * @param {object} params
   * @param {string} params.keyword - 搜索关键词（必填）
   * @returns {Promise<{tracks: Array<{url, title, duration}>, total: number}>}
   */
  async searchMusic(params) {
    if (!params || !params.keyword) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.keyword is required')
    }

    const resp = await this._request({ q: params.keyword })
    const data = await resp.json()

    // Pixabay 返回的 hits 数组中每个元素含 audioURL, tags, duration
    const tracks = (data.hits || []).map(hit => ({
      url: hit.audioURL || hit.audio || '',
      title: hit.tags || hit.user || '',
      duration: hit.duration !== undefined ? Number(hit.duration) : 0,
    }))

    return { tracks, total: data.totalHits || data.total || tracks.length }
  }

  /**
   * 覆盖 capabilities() — 在自动扫描基础上手动添加 searchMusic
   */
  capabilities() {
    const caps = super.capabilities()
    if (!caps.includes('searchMusic')) caps.push('searchMusic')
    return caps
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return PIXABAY_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — GET /?key=xxx&type=music&q=test */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request({ q: 'test' })
      return { success: true }
    } catch (e) {
      if (e instanceof ProviderError && e.code === ERROR_CODES.AUTH_FAILED) {
        return { success: false, error: e }
      }
      return { success: false, error: e }
    }
  }
}

module.exports = { PixabayMusicAdapter, PIXABAY_MODELS }
