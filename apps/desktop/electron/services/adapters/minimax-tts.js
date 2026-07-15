// @ts-check
/**
 * minimax-tts.js — MiniMax TTS Adapter（语音合成）
 *
 * MiniMax TTS API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - synthesize: POST /t2a_v2，请求体 { model, text, voice_setting, audio_setting }
 * - 响应中 data.audio 为 hex 编码字符串，需转换为 Buffer
 * - 支持 speed（0.5-2，默认 1.0）和 pitch（默认 0）
 * - 支持 mp3/wav/flac 格式，采样率 32000
 *
 * 默认端点 https://api.minimaxi.com/v1，需 API Key。
 * 支持模型：speech-2.8-hd、speech-2.8-turbo、speech-2.6-hd、speech-2.6-turbo。
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /t2a_v2
 *   - listModels()      静态预定义列表
 *   - testConnection()  验证 apiKey 存在
 *   - validateConfig()  apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - synthesize 返回 { audio: Buffer, format } 统一格式（hex → Buffer 转换）
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_MODEL = 'speech-2.8-hd'
const DEFAULT_VOICE = 'male-qn-qingse'
const DEFAULT_SPEED = 1.0
const DEFAULT_PITCH = 0
const DEFAULT_OUTPUT_FORMAT = 'mp3'
const DEFAULT_SAMPLE_RATE = 32000

// 静态预定义 MiniMax TTS 模型列表
const MINIMAX_TTS_MODELS = [
  { id: 'speech-2.8-hd',     name: 'Speech 2.8 HD',     description: '高质量语音合成 v2.8' },
  { id: 'speech-2.8-turbo',  name: 'Speech 2.8 Turbo',  description: '快速语音合成 v2.8' },
  { id: 'speech-2.6-hd',     name: 'Speech 2.6 HD',     description: '高质量语音合成 v2.6' },
  { id: 'speech-2.6-turbo',  name: 'Speech 2.6 Turbo',  description: '快速语音合成 v2.6' },
]

class MinimaxTtsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - MiniMax API Key（必填）
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

  /** 验证配置：apiKey + baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — MiniMax 使用 Bearer 认证 */
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
        const message = (errorBody && errorBody.base_resp && errorBody.base_resp.status_msg)
          || (errorBody && errorBody.message)
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
   * POST /t2a_v2 — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.model='speech-2.8-hd'] - TTS 模型 ID
   * @param {string} [params.voice] - 声音 ID（voice_id）
   * @param {number} [params.speed=1.0] - 速度（0.5-2）
   * @param {number} [params.pitch=0] - 音调
   * @param {string} [params.outputFormat='mp3'] - 输出格式（mp3/wav/flac）
   * @returns {Promise<{audio: Buffer, format: string}>} audio 为 hex 转 Buffer
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const model = params.model || DEFAULT_MODEL
    const voice = params.voice || DEFAULT_VOICE
    const speed = params.speed !== undefined ? params.speed : DEFAULT_SPEED
    const pitch = params.pitch !== undefined ? params.pitch : DEFAULT_PITCH
    const outputFormat = params.outputFormat || DEFAULT_OUTPUT_FORMAT

    const body = {
      model,
      text: params.text,
      voice_setting: {
        voice_id: voice,
        speed,
        pitch,
      },
      audio_setting: {
        format: outputFormat,
        sample_rate: DEFAULT_SAMPLE_RATE,
      },
    }

    const resp = await this._request('/t2a_v2', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // MiniMax 响应中 data.audio 为 hex 编码字符串
    const hexAudio = data?.data?.audio || data?.audio
    if (!hexAudio) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'Missing audio data in response',
        { providerId: this.id }
      )
    }

    // hex 字符串 → Buffer
    const audio = Buffer.from(hexAudio, 'hex')

    return {
      audio,
      format: outputFormat,
    }
  }

  /** 返回静态预定义 MiniMax TTS 模型列表（副本） */
  async listModels() {
    return MINIMAX_TTS_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 验证 apiKey 存在 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return {
        success: false,
        error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')),
      }
    }
    return { success: true }
  }
}

module.exports = { MinimaxTtsAdapter, MINIMAX_TTS_MODELS }
