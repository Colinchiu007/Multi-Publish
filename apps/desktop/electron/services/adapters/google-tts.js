// @ts-check
/**
 * google-tts.js — Google Cloud Text-to-Speech Adapter
 *
 * Google Cloud TTS API 关键特性：
 * - 认证：API Key 作为 query param ?key=xxx（默认），或 accessToken 作为 Bearer 头
 * - synthesize: POST /v1/text:synthesize，请求体含 input/voice/audioConfig
 * - 响应 JSON 含 audioContent 字段（Base64 编码的音频），需解码为 Buffer
 * - listVoices: GET /v1/voices 返回 { voices: [{ name, languageCodes, ssmlGender, ... }] }
 * - testConnection: 通过 listVoices 验证认证（返回 voices 数量）
 * - voice.languageCode 默认 en-US，可通过 params.languageCode 覆盖
 * - voice.ssmlGender 默认 NEUTRAL，可通过 params.ssmlGender 覆盖
 * - audioConfig.audioEncoding 默认 MP3，可通过 params.format 覆盖
 * - audioConfig.speakingRate 默认 1.0，可通过 params.speakingRate 覆盖
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /v1/text:synthesize
 *   - listVoices()       GET /v1/voices
 *   - testConnection()   通过 listVoices 验证
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - synthesize 返回 { audio: Buffer, format } 统一格式
 * - apiKey 优先作为 query param，accessToken 作为 Bearer 头备用
 * - 所有 HTTP 错误统一抛 ProviderError
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://texttospeech.googleapis.com'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_LANGUAGE_CODE = 'en-US'
const DEFAULT_SSML_GENDER = 'NEUTRAL'
const DEFAULT_AUDIO_ENCODING = 'MP3'
const DEFAULT_SPEAKING_RATE = 1.0

class GoogleTtsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Google API Key（必填，作为 ?key=xxx 查询参数）
   * @param {string} [credentials.accessToken] - OAuth2 Bearer token（可选，覆盖 apiKey）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：apiKey 必填（除非使用 accessToken） */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey && !this.credentials.accessToken) {
      errors.push('apiKey is required (or accessToken for OAuth2)')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 使用 accessToken 时为 Bearer，否则无认证头（apiKey 走 query） */
  _headers() {
    const headers = {
      'Content-Type': 'application/json',
    }
    if (this.credentials.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`
    }
    return headers
  }

  /**
   * 构造完整 URL
   * @param {string} path - 路径（含 /v1 前缀）
   * @param {object} [queryParams={}] - 查询参数
   */
  _url(path, queryParams = {}) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    let url = `${base}${path}`
    // apiKey 走 query param（除非已使用 Bearer token）
    const params = { ...queryParams }
    if (this.credentials.apiKey && !this.credentials.accessToken) {
      params.key = this.credentials.apiKey
    }
    const entries = Object.entries(params).filter(([_, v]) => v !== undefined && v !== null)
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
        // Google 错误格式：{ error: { message: "...", code: ..., status: "..." } }
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
   * POST /v1/text:synthesize — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.languageCode='en-US'] - 语言代码
   * @param {string} [params.ssmlGender='NEUTRAL'] - SSML 性别（NEUTRAL/MALE/FEMALE）
   * @param {string} [params.voiceName] - 具体声音名称（覆盖 languageCode + ssmlGender）
   * @param {string} [params.format='MP3'] - 音频编码（MP3/WAV/OGG_OPUS等）
   * @param {number} [params.speakingRate=1.0] - 语速（0.25-4.0）
   * @param {number} [params.pitch] - 音调（-20.0 ~ 20.0）
   * @returns {Promise<{audio: Buffer, format: string}>}
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const languageCode = params.languageCode || DEFAULT_LANGUAGE_CODE
    const ssmlGender = params.ssmlGender || DEFAULT_SSML_GENDER
    const audioEncoding = params.format || DEFAULT_AUDIO_ENCODING
    const speakingRate = params.speakingRate !== undefined ? params.speakingRate : DEFAULT_SPEAKING_RATE

    const voice = {
      languageCode,
      ssmlGender,
    }
    // voiceName 覆盖 languageCode + ssmlGender
    if (params.voiceName) {
      voice.name = params.voiceName
    }

    const audioConfig = {
      audioEncoding,
      speakingRate,
    }
    if (params.pitch !== undefined) {
      audioConfig.pitch = params.pitch
    }

    const body = {
      input: { text: params.text },
      voice,
      audioConfig,
    }

    const resp = await this._request('/v1/text:synthesize', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const data = await resp.json()

    if (!data.audioContent) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Google TTS response missing audioContent field', {
        providerId: this.id,
      })
    }

    // Base64 解码为 Buffer
    const audio = Buffer.from(data.audioContent, 'base64')

    // 格式归一化：MP3 → mp3, WAV → wav
    const format = audioEncoding.toLowerCase().replace('ogg_opus', 'ogg')

    return {
      audio,
      format,
    }
  }

  /**
   * GET /v1/voices — 列出可用声音
   * @returns {Promise<Array<{name, languageCodes, ssmlGender, naturalSampleRateHertz}>>}
   */
  async listVoices() {
    const resp = await this._request('/v1/voices')
    const body = await resp.json()
    return body.voices || []
  }

  /**
   * 测试连接 — 通过 listVoices 验证认证
   * 返回 voices 数量作为连通性证明
   */
  async testConnection() {
    try {
      const voices = await this.listVoices()
      return { success: true, voices: voices.length }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { GoogleTtsAdapter }
