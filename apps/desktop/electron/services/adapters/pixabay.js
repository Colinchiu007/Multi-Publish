// @ts-check
/**
 * pixabay.js — Pixabay 图片搜索 Adapter（非生成，搜索 API）
 *
 * Pixabay API 关键特性：
 * - 认证：API Key 作为 query param（?key=xxx）
 * - baseUrl: https://pixabay.com/api/（末尾含斜杠）
 * - generateImage: GET /?key=xxx&q=keyword&image_type=photo&per_page=3
 *   原始返回 { total, totalHits, hits: [{ webformatURL, tags, previewURL, ... }] }
 *   转换为统一格式 { images: [{ url, tags, previewURL }], total, model: 'pixabay-search' }
 * - 注：这是搜索 API，prompt 作为搜索关键词
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    GET /?key=xxx&q=keyword&image_type=photo&per_page=3
 *   - listModels()       静态预定义列表（仅一个 'pixabay-search'）
 *   - testConnection()   GET /?key=xxx&q=test 检查 HTTP 200
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://pixabay.com/api/'
const DEFAULT_TIMEOUT = 30000
const DEFAULT_PER_PAGE = 3

// 静态预定义模型列表（搜索 API 仅一个）
const PIXABAY_MODELS = [
  { id: 'pixabay-search', name: 'Pixabay Search', description: 'Pixabay 图片搜索（非生成）' },
]

class PixabayAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Pixabay API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点（默认末尾含 /）
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

  /** 构造请求头 — Pixabay 不需要 Authorization 头 */
  _headers() {
    return {
      'Accept': 'application/json',
    }
  }

  /**
   * 构造完整 URL — Pixabay 用 query string 传递 key 和参数
   * baseUrl 末尾的 / 保留（Pixabay 约定）
   */
  _url(params) {
    const base = this.credentials.baseUrl
    const sep = base.includes('?') ? '&' : '?'
    const query = new URLSearchParams(params).toString()
    return `${base}${sep}${query}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(params) {
    const url = this._url(params)
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
   * GET /?key=xxx&q=keyword — 图片搜索（非生成）
   *
   * @param {object} params
   * @param {string} params.prompt - 搜索关键词（必填，作为 q 参数）
   * @param {string} [params.image_type='photo'] - 图片类型
   * @param {number} [params.per_page=3] - 每页数量
   * @returns {Promise<{images: Array<{url, tags, previewURL}>, total: number, model: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const queryParams = {
      key: this.credentials.apiKey,
      q: params.prompt,
      image_type: params.image_type || 'photo',
      per_page: params.per_page || DEFAULT_PER_PAGE,
    }

    const resp = await this._request(queryParams)
    const data = await resp.json()

    // Pixabay 返回 hits: [{ webformatURL, tags, previewURL, ... }]
    // 转换为统一格式 images: [{ url, tags, previewURL }]
    const hits = data.hits || []
    const images = hits.map(h => ({
      url: h.webformatURL || h.largeImageURL,
      tags: h.tags,
      previewURL: h.previewURL,
    }))

    return {
      images,
      total: data.total || 0,
      model: 'pixabay-search',
    }
  }

  /**
   * 返回静态预定义模型列表
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    return PIXABAY_MODELS.map(m => ({ ...m }))
  }

  /**
   * 测试连接 — GET /?key=xxx&q=test 检查 HTTP 200
   */
  async testConnection() {
    try {
      await this._request({
        key: this.credentials.apiKey,
        q: 'test',
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { PixabayAdapter, PIXABAY_MODELS }
