// @ts-check
/**
 * piper.js — Piper 本地 TTS Adapter
 *
 * Piper HTTP 服务器（https://github.com/rhasspy/piper-http）关键特性：
 * - 无需认证（本地服务，默认 http://localhost:5000）
 * - synthesize: POST /，请求体 JSON { text, model, speaker? }
 *   或直接 POST /?text=xxx&model=xxx（query 参数模式）
 * - 响应为二进制 WAV 音频流（非 Base64，非 JSON）
 * - listVoices: GET /models 返回可用模型列表
 * - testConnection: GET /models 检查服务是否在线
 * - validateConfig: baseUrl 必填，apiKey 可选（本地服务通常无需认证）
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /
 *   - listVoices()       GET /models
 *   - testConnection()   GET /models 验证在线
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - synthesize 返回 { audio: ArrayBuffer, format: 'wav' } 统一格式
 * - baseUrl 必填且可配置（支持远程 Piper 实例）
 * - apiKey 可选（远程实例可启用 token 鉴权）
 * - 所有 HTTP 错误统一抛 ProviderError
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'http://localhost:5000'
const DEFAULT_TIMEOUT = 30000
const DEFAULT_FORMAT = 'wav'

class PiperAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.baseUrl - Piper HTTP 服务端点（必填，默认 http://localhost:5000）
   * @param {string} [credentials.apiKey] - 可选鉴权 token（远程实例启用鉴权时使用）
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - 请求超时（ms）
   * @param {number} [options.maxRetries=1] - 最大重试次数（本地服务，重试意义有限）
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 1
  }

  /** 验证配置：baseUrl 必填，apiKey 可选 */
  validateConfig() {
    const errors = []
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — apiKey 可选（远程鉴权时使用 Bearer） */
  _headers() {
    const headers = {
      'Content-Type': 'application/json',
    }
    if (this.credentials.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`
    }
    return headers
  }

  /** 构造完整 URL */
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
  async _request(path, opts = {}, queryParams = {}) {
    const url = this._url(path, queryParams)
    const headers = { ...this._headers(), ...(opts.headers || {}) }

    try {
      const response = await fetch(url, {
        ...opts,
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        // Piper 错误格式：{ error: "..." } 或纯文本
        const message = (errorBody && (errorBody.error || errorBody.message))
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
   * POST / — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.model] - 模型名称（如 en_US-lessac-medium）
   * @param {number} [params.speaker] - 说话人 ID（多说话人模型）
   * @param {number} [params.lengthScale] - 语速缩放（1.0=原速）
   * @param {boolean} [params.useQueryParams=false] - 使用 query 参数模式而非 JSON body
   * @returns {Promise<{audio: ArrayBuffer, format: string}>}
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const queryParams = {}
    const body = {
      text: params.text,
    }

    if (params.model !== undefined) body.model = params.model
    if (params.speaker !== undefined) body.speaker = params.speaker
    if (params.lengthScale !== undefined) body.lengthScale = params.lengthScale

    let resp
    if (params.useQueryParams) {
      // query 参数模式：POST /?text=xxx&model=xxx
      Object.assign(queryParams, body)
      resp = await this._request('/', { method: 'POST' }, queryParams)
    } else {
      // JSON body 模式（默认）
      resp = await this._request('/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    }

    // Piper 返回二进制 WAV 音频流（非 Base64，非 JSON）
    const audio = await resp.arrayBuffer()

    return {
      audio,
      format: DEFAULT_FORMAT,
    }
  }

  /**
   * GET /models — 列出可用模型
   * @returns {Promise<Array<{name, language?, path?}>>}
   */
  async listVoices() {
    const resp = await this._request('/models')
    const body = await resp.json()

    // 兼容两种返回格式：数组 或 { models: [...] }
    const models = Array.isArray(body) ? body : (body.models || [])

    // 归一化为统一格式
    return models.map(m => {
      if (typeof m === 'string') {
        return { name: m }
      }
      return {
        name: m.name || m.id || m.model,
        language: m.language,
        path: m.path,
      }
    })
  }

  /**
   * 测试连接 — GET /models 检查服务是否在线
   * 返回 models 数量作为连通性证明
   */
  async testConnection() {
    try {
      const models = await this.listVoices()
      return { success: true, voices: models.length }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { PiperAdapter }
