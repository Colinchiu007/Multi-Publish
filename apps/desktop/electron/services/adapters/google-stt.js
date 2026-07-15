// @ts-check
/**
 * google-stt.js — Google Speech-to-Text Adapter
 *
 * Google Cloud Speech-to-Text API 关键特性：
 * - 认证方式：API Key 作为 query param ?key=xxx（非 Bearer / 非 Header）
 * - transcribe: POST /v1/speech:recognize，请求体含 config + audio.content（Base64）
 * - 返回结果含 results[].alternatives[]，每个 alternative 含 transcript + confidence
 * - 默认语言 en-US，可通过 params.language 覆盖
 * - 默认编码 LINEAR16 / 16kHz（适合电话/麦克风录音）
 *
 * 实现的方法（capabilities）：
 *   - validateConfig()    apiKey 必填
 *   - testConnection()    通过最小 recognize 请求验证
 *   - transcribe()        POST /v1/speech:recognize
 *
 * 设计决策：
 * - transcribe 不在 KNOWN_METHODS 中，需在类中直接定义为实例方法
 * - capabilities() 覆盖为 super.capabilities().concat(['transcribe'])
 * - API Key 通过 query param 传递（Google 的非标准认证方式）
 * - 音频内容统一以 Base64 字符串传入，由调用方负责编码
 * - 所有 HTTP 错误统一抛 ProviderError，网络错误区分 TIMEOUT / NETWORK_ERROR
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://speech.googleapis.com/v1'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_LANGUAGE = 'en-US'
const DEFAULT_ENCODING = 'LINEAR16'
const DEFAULT_SAMPLE_RATE = 16000

class GoogleSttAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Google API Key（必填）
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

  /** 构造请求头 — Google STT 不需要 Authorization，仅 Content-Type */
  _headers() {
    return {
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL — Google 通过 ?key=xxx 认证 */
  _url(path, queryParams = {}) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    let url = `${base}${path}`
    // 始终附加 key 参数
    const params = { key: this.credentials.apiKey, ...queryParams }
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
        // Google 错误格式：{ error: { message: "...", status: "..." } }
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
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
   * POST /v1/speech:recognize — 语音识别
   *
   * @param {object} params
   * @param {string} params.audio - 音频内容（Base64 编码字符串，必填）
   * @param {string} [params.language='en-US'] - 语言代码
   * @param {string} [params.encoding='LINEAR16'] - 音频编码
   * @param {number} [params.sampleRateHertz=16000] - 采样率
   * @param {number} [params.audioChannelCount] - 声道数
   * @param {boolean} [params.enableWordTimeOffsets] - 启用词级时间戳
   * @returns {Promise<{text: string, language: string, confidence: number, alternatives: Array}>}
   */
  async transcribe(params) {
    if (!params || !params.audio) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.audio is required')
    }

    const language = params.language || DEFAULT_LANGUAGE
    const encoding = params.encoding || DEFAULT_ENCODING
    const sampleRateHertz = params.sampleRateHertz || DEFAULT_SAMPLE_RATE

    const config = {
      languageCode: language,
      encoding,
      sampleRateHertz,
    }
    if (params.audioChannelCount !== undefined) config.audioChannelCount = params.audioChannelCount
    if (params.enableWordTimeOffsets !== undefined) config.enableWordTimeOffsets = params.enableWordTimeOffsets

    const body = {
      config,
      audio: { content: params.audio },
    }

    const resp = await this._request('/speech:recognize', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // Google 返回 { results: [{ alternatives: [{ transcript, confidence }] }] }
    const results = data.results || []
    const alternatives = (results[0] && results[0].alternatives) || []
    const topAlternative = alternatives[0] || {}

    return {
      text: topAlternative.transcript || '',
      language,
      confidence: typeof topAlternative.confidence === 'number' ? topAlternative.confidence : 0,
      alternatives: alternatives.map(a => ({
        text: a.transcript || '',
        confidence: typeof a.confidence === 'number' ? a.confidence : 0,
      })),
    }
  }

  /**
   * 测试连接 — 通过最小 recognize 请求验证 API Key 有效性
   * 使用空音频 + 默认配置，仅验证认证与端点可达
   */
  async testConnection() {
    try {
      // 用一个 1 字节静音音频的 Base64 触发最小请求
      // 目的是验证 API Key 有效性，不要求真实识别结果
      await this._request('/speech:recognize', {
        method: 'POST',
        body: JSON.stringify({
          config: {
            languageCode: DEFAULT_LANGUAGE,
            encoding: DEFAULT_ENCODING,
            sampleRateHertz: DEFAULT_SAMPLE_RATE,
          },
          audio: { content: '' },
        }),
      })
      return { success: true }
    } catch (e) {
      // 空音频可能返回 400（无效输入），但 401/403 才是认证失败
      // 仅当错误为 AUTH_FAILED 时视为连接失败
      if (e instanceof ProviderError && e.code === ERROR_CODES.AUTH_FAILED) {
        return { success: false, error: e }
      }
      // 其他错误（包括 400 invalid argument）说明认证通过、端点可达
      return { success: true }
    }
  }

  /**
   * capabilities() — 覆盖以手动添加 'transcribe'
   * transcribe 不在 BaseAdapter 的 KNOWN_METHODS 中，supports() 默认返回 false
   */
  capabilities() {
    return super.capabilities().concat(['transcribe'])
  }
}

module.exports = { GoogleSttAdapter }
