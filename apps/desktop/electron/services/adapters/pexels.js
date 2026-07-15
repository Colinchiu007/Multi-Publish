// @ts-check
/**
 * pexels.js — Pexels 图片搜索 Adapter
 *
 * Pexels API 关键特性：
 * - 认证：Authorization header（直接放 apiKey，非 Bearer）
 * - baseUrl: https://api.pexels.com/v1
 * - generateImage: GET /search?query=keyword&per_page=3
 *   原始返回 { total_results, photos: [{ src, alt, photographer, ... }] }
 *   转换为统一格式 { images: [{ url, alt, photographer }], total, model: 'pexels-search' }
 * - 注：这是搜索 API，prompt 作为搜索关键词
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    GET /search?query=keyword&per_page=3
 *   - listModels()       静态预定义列表（仅一个 'pexels-search'）
 *   - testConnection()   GET /search?query=test 验证
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.pexels.com/v1'
const DEFAULT_TIMEOUT = 30000
const DEFAULT_PER_PAGE = 3

// 静态预定义模型列表
const PEXELS_MODELS = [
  { id: 'pexels-search', name: 'Pexels Search', description: 'Pexels 图片搜索（非生成）' },
]

class PexelsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Pexels API Key（必填，作为 Authorization 头）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
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
    if (!this.credentials.apiKey) {
      errors.push('apiKey is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Pexels 使用 Authorization 直接放 apiKey（非 Bearer） */
  _headers() {
    return {
      'Authorization': this.credentials.apiKey,
      'Accept': 'application/json',
    }
  }

  /** 构造完整 URL — Pexels 用 query string 传递 search 参数 */
  _url(path, params) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    const query = new URLSearchParams(params).toString()
    return `${base}${path}?${query}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, params) {
    const url = this._url(path, params)
    const headers = this._headers()

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
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
   * GET /search?query=keyword&per_page=3 — 图片搜索（非生成）
   *
   * @param {object} params
   * @param {string} params.prompt - 搜索关键词（必填，作为 query 参数）
   * @param {number} [params.per_page=3] - 每页数量
   * @returns {Promise<{images: Array<{url, alt, photographer}>, total: number, model: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const queryParams = {
      query: params.prompt,
      per_page: params.per_page || DEFAULT_PER_PAGE,
    }

    const resp = await this._request('/search', queryParams)
    const data = await resp.json()

    // Pexels 返回 photos: [{ src: { original, large, ... }, alt, photographer, ... }]
    // 转换为统一格式 images: [{ url, alt, photographer }]
    const photos = data.photos || []
    const images = photos.map(p => ({
      url: p.src && (p.src.large || p.src.original),
      alt: p.alt,
      photographer: p.photographer,
    }))

    return {
      images,
      total: data.total_results || 0,
      model: 'pexels-search',
    }
  }

  /**
   * 返回静态预定义模型列表
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    return PEXELS_MODELS.map(m => ({ ...m }))
  }

  /**
   * 测试连接 — GET /search?query=test 验证
   */
  async testConnection() {
    try {
      await this._request('/search', { query: 'test', per_page: 1 })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { PexelsAdapter, PEXELS_MODELS }
