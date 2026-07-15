// @ts-check
/**
 * local-whisper.js — 本地 Whisper 语音识别 Adapter
 *
 * 适配两种主流的本地 Whisper HTTP 服务：
 * 1. ahmetoner/whisper-asr-webservice：POST /asr，FormData { audio_file, model, language? }
 * 2. openai/whisper 风格 API：POST /transcribe，FormData { file, model, language? }
 *
 * 关键特性：
 * - 无需认证（本地部署）
 * - baseUrl 默认 http://localhost:8080（可配置）
 * - testConnection: GET /models 检查服务是否在线
 * - validateConfig: baseUrl 必填，apiKey 可选（兼容需鉴权的反代场景）
 * - 默认 endpoint='asr'，可传 'transcribe' 切换到 OpenAI 风格端点
 *
 * 实现的方法（capabilities）：
 *   - validateConfig()    baseUrl 必填
 *   - testConnection()    GET /models 验证服务可达
 *   - listModels()        GET /models 返回可用模型列表
 *   - transcribe()        POST /asr 或 /transcribe（FormData）
 *
 * 设计决策：
 * - transcribe 不在 KNOWN_METHODS 中，需在类中直接定义为实例方法
 * - capabilities() 覆盖为 super.capabilities().concat(['transcribe'])
 * - 音频以 Buffer 传入，由 Adapter 写入 FormData（调用方无需关心编码）
 * - 使用 Node 18+ 原生 FormData 与 fetch（无需 form-data 第三方库）
 * - 所有 HTTP 错误统一抛 ProviderError，网络错误区分 TIMEOUT / NETWORK_ERROR
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'http://localhost:8080'
const DEFAULT_TIMEOUT = 120000 // 本地识别可能较慢
const DEFAULT_MODEL = 'base'
const DEFAULT_ENDPOINT = 'asr'
const DEFAULT_LANGUAGE = 'auto'

class LocalWhisperAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 服务地址（默认 http://localhost:8080）
   * @param {string} [credentials.apiKey] - 可选鉴权 token（反代场景）
   * @param {object} [options]
   * @param {number} [options.timeout=120000] - 请求超时（ms）
   * @param {number} [options.maxRetries=0] - 最大重试次数（本地服务默认不重试）
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries !== undefined ? this.options.maxRetries : 0
  }

  /** 验证配置：baseUrl 必填，apiKey 可选 */
  validateConfig() {
    const errors = []
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — apiKey 可选（用于反代鉴权） */
  _headers(extra = {}) {
    const headers = { ...extra }
    if (this.credentials.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`
    }
    return headers
  }

  /** 构造完整 URL */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   * 注意：FormData 请求不应强制设置 Content-Type（由 fetch 自动生成 boundary）
   */
  async _request(path, opts = {}) {
    const url = this._url(path)
    // FormData 时不传 Content-Type，让 fetch 自动设置 multipart boundary
    const isFormData = opts.body && typeof opts.body === 'object' && opts.body instanceof FormData
    const baseHeaders = isFormData
      ? { ...(this.credentials.apiKey ? { 'Authorization': `Bearer ${this.credentials.apiKey}` } : {}) }
      : this._headers()
    const headers = { ...baseHeaders, ...(opts.headers || {}) }

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
        // Whisper 服务错误格式多样：{ detail: "..." } 或 { error: "..." } 或纯文本
        const message = (errorBody && (errorBody.detail || errorBody.error || errorBody.message))
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
   * GET /models — 列出可用模型
   * 兼容 ahmetoner/whisper-asr-webservice 的 /models 端点
   * @returns {Promise<Array<string|{id, name}>>}
   */
  async listModels() {
    const resp = await this._request('/models')
    const data = await resp.json()
    // 不同实现返回格式不同：可能是 ["base", "small", ...] 或 [{ id, name }]
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.models)) return data.models
    return []
  }

  /**
   * POST /asr 或 /transcribe — 语音识别（FormData 上传音频）
   *
   * @param {object} params
   * @param {Buffer|ArrayBuffer|Uint8Array|Blob} params.audio - 音频二进制数据（必填）
   * @param {string} [params.filename='audio.wav'] - 文件名（用于 FormData 字段）
   * @param {string} [params.model='base'] - Whisper 模型名
   * @param {string} [params.language] - 语言代码（不传则自动检测）
   * @param {string} [params.endpoint='asr'] - 端点类型：'asr' 或 'transcribe'
   * @param {string} [params.responseFormat] - 响应格式（json/text/srt/vtt）
   * @returns {Promise<{text: string, language: string, duration: number}>}
   */
  async transcribe(params) {
    if (!params || !params.audio) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.audio is required')
    }

    const model = params.model || DEFAULT_MODEL
    const endpoint = params.endpoint || DEFAULT_ENDPOINT
    const filename = params.filename || 'audio.wav'

    // 构造 FormData
    const form = new FormData()
    // ahmetoner/asr 用 audio_file，openai 风格用 file
    const fileField = endpoint === 'transcribe' ? 'file' : 'audio_file'

    // 将 Buffer/ArrayBuffer/Uint8Array 包装为 Blob（fetch FormData 兼容）
    let audioBlob = params.audio
    if (audioBlob instanceof Buffer) {
      audioBlob = new Blob([audioBlob])
    } else if (audioBlob instanceof ArrayBuffer) {
      audioBlob = new Blob([audioBlob])
    } else if (audioBlob instanceof Uint8Array) {
      audioBlob = new Blob([audioBlob])
    }
    form.append(fileField, audioBlob, filename)
    form.append('model', model)
    if (params.language) {
      form.append('language', params.language)
    }
    if (params.responseFormat) {
      form.append('response_format', params.responseFormat)
    }

    const path = endpoint === 'transcribe' ? '/transcribe' : '/asr'
    const resp = await this._request(path, {
      method: 'POST',
      body: form,
    })

    // Whisper 服务可能返回 JSON { text: "..." } 或纯文本
    let text = ''
    let duration = 0
    const contentType = resp.headers && (resp.headers.get ? resp.headers.get('content-type') : '') || ''
    if (contentType.includes('application/json')) {
      const data = await resp.json()
      text = data.text || ''
      // 部分实现返回 segments[]，duration 取最后一段的 end
      if (Array.isArray(data.segments) && data.segments.length > 0) {
        const lastSeg = data.segments[data.segments.length - 1]
        if (lastSeg && typeof lastSeg.end === 'number') duration = lastSeg.end
      }
    } else {
      text = await resp.text()
    }

    // language 字段返回原始传入值或 'auto'
    const language = params.language || DEFAULT_LANGUAGE

    return {
      text: typeof text === 'string' ? text.trim() : String(text || ''),
      language,
      duration,
    }
  }

  /**
   * 测试连接 — GET /models 检查服务是否在线
   * 返回 models 数量作为连通性证明
   */
  async testConnection() {
    try {
      const models = await this.listModels()
      return { success: true, models: models.length }
    } catch (e) {
      return { success: false, error: e }
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

module.exports = { LocalWhisperAdapter }
