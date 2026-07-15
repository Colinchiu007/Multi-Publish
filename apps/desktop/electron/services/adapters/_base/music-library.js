// @ts-check
/**
 * music-library.js — 本地音乐库 Adapter
 *
 * 本地音乐库关键特性：
 * - 本地部署服务（默认 http://localhost:3000，可配置）
 * - 无需认证
 * - searchMusic: GET /api/music?keyword=xxx
 *   （自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加）
 * - 返回 { tracks: [{ url, title, artist }], total }
 * - testConnection: GET /api/health
 *
 * 实现的方法（capabilities）：
 *   - searchMusic()    搜索本地音乐（自定义方法）
 *   - listModels()     静态预定义列表
 *   - testConnection() GET /api/health
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_TIMEOUT = 30000

// 静态预定义模型列表
const MUSIC_LIBRARY_MODELS = [
  { id: 'music-library', name: 'Music Library', description: '本地音乐库服务' },
]

class MusicLibraryAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 本地服务地址（默认 http://localhost:3000）
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
      'Accept': 'application/json',
    }
  }

  /** 构造完整 URL（含 query 参数） */
  _url(path, queryParams = {}) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    let url = `${base}${path}`
    const entries = Object.entries(queryParams).filter(([_, v]) => v !== undefined && v !== null)
    if (entries.length > 0) {
      const sep = url.includes('?') ? '&' : '?'
      const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      url += `${sep}${qs}`
    }
    return url
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, queryParams = {}) {
    const url = this._url(path, queryParams)
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
   * 搜索本地音乐
   * 自定义方法，不在 KNOWN_METHODS 中，需在 capabilities() 中手动添加
   *
   * @param {object} params
   * @param {string} params.keyword - 搜索关键词（必填）
   * @returns {Promise<{tracks: Array<{url, title, artist}>, total: number}>}
   */
  async searchMusic(params) {
    if (!params || !params.keyword) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.keyword is required')
    }

    const resp = await this._request('/api/music', { keyword: params.keyword })
    const data = await resp.json()

    // 本地音乐库返回 tracks 数组
    const tracks = (data.tracks || data.data || []).map(item => ({
      url: item.url || '',
      title: item.title || item.name || '',
      artist: item.artist || '',
    }))

    return { tracks, total: data.total !== undefined ? data.total : tracks.length }
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
    return MUSIC_LIBRARY_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — GET /api/health */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    try {
      await this._request('/api/health')
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { MusicLibraryAdapter, MUSIC_LIBRARY_MODELS }
