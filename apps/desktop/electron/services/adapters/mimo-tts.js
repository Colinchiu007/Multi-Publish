// @ts-check
/**
 * mimo-tts.js — 小米 MiMo TTS Adapter（语音合成）
 *
 * MiMo TTS 兼容 OpenAI Chat Completions 接口，通过 messages 传递文本，
 * audio 字段配置声音和格式。
 *
 * 默认端点 https://api.xiaomimimo.com/v1，需 API Key。
 * 支持模型：mimo-v2.5-tts、mimo-v2.5-tts-voicedesign、mimo-v2.5-tts-voiceclone。
 *
 * MiMo API 关键特性：
 * - 认证头 api-key: $MIMO_API_KEY（非标准 Bearer，是自定义 api-key header）
 * - synthesize: POST /chat/completions（OpenAI Chat 兼容格式）
 * - 请求体 { model, messages: [{role:'assistant', content: text}], audio: { voice, format }, stream: false }
 * - 响应中 choices[0].message.audio.data 为 base64 编码音频
 * - speed/pitch 无法直接映射，忽略或放入 user message 自然语言指令
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /chat/completions
 *   - listModels()       静态预定义列表（无 HTTP 请求）
 *   - testConnection()   验证 apiKey 存在
 *   - validateConfig()   apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError → supports() 返回 false）
 * - synthesize 返回 { audio: base64数据, format: 'wav' } 统一格式
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_MODEL = 'mimo-v2.5-tts'
const DEFAULT_VOICE = 'default'
const DEFAULT_OUTPUT_FORMAT = 'wav'

// 静态预定义 MiMo TTS 模型列表
const MIMO_TTS_MODELS = [
  { id: 'mimo-v2.5-tts',              name: 'MiMo TTS v2.5',            description: '基础 TTS 模型' },
  { id: 'mimo-v2.5-tts-voicedesign',  name: 'MiMo TTS Voice Design',    description: '声音设计模型' },
  { id: 'mimo-v2.5-tts-voiceclone',   name: 'MiMo TTS Voice Clone',     description: '声音克隆模型' },
]

class MimoTtsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - MiMo API Key（必填）
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

  /** 构造请求头 — MiMo 使用自定义 api-key header（非 Bearer） */
  _headers() {
    return {
      'api-key': this.credentials.apiKey,
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
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
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
   * POST /chat/completions — 语音合成（OpenAI Chat 兼容格式）
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.model='mimo-v2.5-tts'] - TTS 模型 ID
   * @param {string} [params.voice='default'] - 声音 ID
   * @param {string} [params.outputFormat='wav'] - 输出格式（wav/mp3/flac）
   * @param {number} [params.speed] - 速度（无法直接映射，忽略）
   * @param {number} [params.pitch] - 音调（无法直接映射，忽略）
   * @returns {Promise<{audio: string, format: string}>} audio 为 base64 编码字符串
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const model = params.model || DEFAULT_MODEL
    const voice = params.voice || DEFAULT_VOICE
    const outputFormat = params.outputFormat || DEFAULT_OUTPUT_FORMAT

    const body = {
      model,
      messages: [{ role: 'assistant', content: params.text }],
      audio: {
        voice,
        format: outputFormat,
      },
      stream: false,
    }

    const resp = await this._request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // 提取 base64 音频数据
    const audioData = data?.choices?.[0]?.message?.audio?.data
    if (!audioData) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'Missing audio data in response',
        { providerId: this.id }
      )
    }

    return {
      audio: audioData,
      format: outputFormat,
    }
  }

  /** 返回静态预定义 MiMo TTS 模型列表（副本，防止污染） */
  async listModels() {
    return MIMO_TTS_MODELS.map(m => ({ ...m }))
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

module.exports = { MimoTtsAdapter, MIMO_TTS_MODELS }
