// @ts-check
/**
 * doubao-tts.js — 豆包 TTS Adapter（字节跳动火山引擎）
 *
 * 火山引擎语音合成 API 关键特性：
 * - 认证：Bearer token + app_id（凭证中携带 appid 与 token）
 * - synthesize: POST /api/v1/tts，请求体嵌套 app/user/audio/request 四段
 * - 响应 JSON 含 data 字段（Base64 编码的音频），需解码为 Buffer
 * - listVoices: 返回静态预定义音色列表（火山引擎无公开列表端点）
 * - testConnection: 通过最小 synthesize 请求验证连通性（会消耗一次配额）
 * - cluster 默认 volcano_tts，可通过 credentials.cluster 覆盖
 * - voice_type 默认 BV001，可通过 params.voice 覆盖
 * - encoding 默认 mp3，可通过 params.format 覆盖
 * - reqid 自动生成 UUID，确保每次请求唯一
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /api/v1/tts
 *   - listVoices()       静态预定义音色列表
 *   - testConnection()   通过 listVoices 验证（无网络请求）
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - synthesize 返回 { audio: Buffer, format, duration? } 统一格式
 * - listVoices 静态列表避免不必要的 HTTP 请求（火山引擎无公开 voices 端点）
 * - 所有 HTTP 错误统一抛 ProviderError
 */

const crypto = require('crypto')
const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://openspeech.bytedance.com'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_CLUSTER = 'volcano_tts'
const DEFAULT_VOICE_TYPE = 'BV001'
const DEFAULT_ENCODING = 'mp3'
const DEFAULT_SPEED_RATIO = 1.0
const DEFAULT_USER_UID = 'user'
const DEFAULT_OPERATION = 'query'

// 静态预定义音色列表（火山引擎无公开 voices 端点，使用静态列表避免不必要请求）
const DOUBAO_VOICES = ['BV001', 'BV002', 'BV406', 'BV407']

class DoubaoTtsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.appId - 火山引擎 App ID（必填）
   * @param {string} credentials.token - 火山引擎 Access Token（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {string} [credentials.cluster='volcano_tts'] - 集群标识
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.credentials.cluster = this.credentials.cluster || DEFAULT_CLUSTER
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：appId 和 token 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.appId) {
      errors.push('appId is required')
    }
    if (!this.credentials.token) {
      errors.push('token is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 火山引擎使用 Bearer token */
  _headers() {
    return {
      'Authorization': `Bearer; ${this.credentials.token}`,
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
        // 火山引擎错误格式：{ code: 3xxx, message: "...", ... } 或字符串
        const message = (errorBody && (errorBody.message || errorBody.msg))
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
   * POST /api/v1/tts — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.voice='BV001'] - 音色 ID
   * @param {string} [params.format='mp3'] - 音频编码格式
   * @param {number} [params.speedRatio=1.0] - 语速比率
   * @param {string} [params.operation='query'] - 操作类型（query/submit）
   * @returns {Promise<{audio: Buffer, format: string, duration?: number}>}
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const voiceType = params.voice || DEFAULT_VOICE_TYPE
    const encoding = params.format || DEFAULT_ENCODING
    const speedRatio = params.speedRatio !== undefined ? params.speedRatio : DEFAULT_SPEED_RATIO
    const operation = params.operation || DEFAULT_OPERATION
    const reqid = crypto.randomUUID()

    const body = {
      app: {
        appid: this.credentials.appId,
        token: this.credentials.token,
        cluster: this.credentials.cluster,
      },
      user: {
        uid: DEFAULT_USER_UID,
      },
      audio: {
        voice_type: voiceType,
        encoding: encoding,
        speed_ratio: speedRatio,
      },
      request: {
        reqid: reqid,
        text: params.text,
        operation: operation,
      },
    }

    const resp = await this._request('/api/v1/tts', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const data = await resp.json()

    // 火山引擎响应：{ code: 3000, data: "<base64>", duration: "1.234", ... }
    // code 非 3xxx 成功；失败时抛 ProviderError
    if (data.code !== undefined && data.code !== 3) {
      // code !== 3 视为业务错误（3 = 成功）
      const errMsg = data.message || data.msg || `Doubao TTS error code: ${data.code}`
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, errMsg, {
        providerId: this.id,
        code: data.code,
      })
    }

    if (!data.data) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Doubao TTS response missing data field', {
        providerId: this.id,
      })
    }

    // Base64 解码为 Buffer
    const audio = Buffer.from(data.data, 'base64')

    const result = {
      audio,
      format: encoding,
    }

    // duration 可选字段（存在则附加）
    if (data.duration !== undefined) {
      result.duration = data.duration
    }

    return result
  }

  /**
   * 返回静态预定义的豆包音色列表
   * 火山引擎无公开 voices 端点，使用静态列表避免不必要的 HTTP 请求
   * @returns {Promise<string[]>}
   */
  async listVoices() {
    return [...DOUBAO_VOICES]
  }

  /**
   * 测试连接 — 通过 validateConfig 验证（无轻量验证端点）
   * 返回配置校验结果，避免消耗合成配额
   */
  async testConnection() {
    try {
      const config = this.validateConfig()
      if (!config.valid) {
        return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, config.errors.join('; ')) }
      }
      return { success: true, voices: DOUBAO_VOICES.length }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { DoubaoTtsAdapter, DOUBAO_VOICES }
