// @ts-check
/**
 * elevenlabs.js — P3.7 ElevenLabs TTS Adapter（第一个非 LLM Adapter）
 *
 * 验证 ITtsAdapter mixin 的扩展性 — 证明 Adapter 架构支持多类别供应商。
 *
 * ElevenLabs API 关键特性：
 * - 认证头 xi-api-key（非 Bearer / x-api-key）
 * - synthesize: POST /v1/text-to-speech/{voice_id} 返回 audio buffer（非 JSON）
 * - listVoices: GET /v1/voices 返回 { voices: [{ voice_id, name, ... }] }
 * - listModels: GET /v1/models 返回 TTS 模型列表
 * - testConnection: 通过 listVoices 验证认证（返回 voices 数量）
 * - outputFormat 作为 query parameter（?output_format=pcm_24000）
 * - voice_settings 嵌套在请求体中（stability/similarity_boost）
 *
 * 实现的方法（capabilities）：
 *   - listModels()         GET /v1/models
 *   - listVoices()         GET /v1/voices
 *   - synthesize()         POST /v1/text-to-speech/{voice_id}
 *   - testConnection()     通过 listVoices 验证
 *
 * 设计决策：
 * - 不覆盖 LLM 方法（BaseAdapter 默认抛 NotImplementedError → supports() 返回 false）
 * - synthesize 返回 { audio, format, voice } 统一格式
 * - outputFormat 默认 mp3_44100_128，可通过 params.outputFormat 覆盖
 * - voice_settings 自动构造（stability/similarity_boost 可选）
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'
const MAX_CLONE_NAME_LENGTH = 128
const MAX_SAMPLE_FILE_NAME_LENGTH = 255
const MAX_SAMPLE_COUNT = 5
const MAX_SAMPLE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_SAMPLE_BYTES = 25 * 1024 * 1024
const SAFE_AUDIO_CONTENT_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
])

function isPlainRecord (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyAllowedKeys (value, allowedKeys) {
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function safeCloneName (value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_CLONE_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) return null
  return normalized
}

function safeFileName (value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_SAMPLE_FILE_NAME_LENGTH || /[\\/:\u0000-\u001f\u007f]/.test(normalized)) return null
  if (normalized === '.' || normalized === '..') return null
  return normalized
}

function safeVoiceId (value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > 256 || !/^[A-Za-z0-9_-]+$/.test(normalized)) return null
  return normalized
}

function normalizeCloneSample (value) {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, new Set(['blob', 'fileName', 'contentType']))) return null
  if (typeof Blob !== 'function' || !(value.blob instanceof Blob) || value.blob.size === 0 || value.blob.size > MAX_SAMPLE_BYTES) return null
  const fileName = safeFileName(value.fileName)
  if (!fileName || !SAFE_AUDIO_CONTENT_TYPES.has(value.contentType)) return null
  if (value.blob.type && value.blob.type !== value.contentType) return null
  return { blob: value.blob, fileName, contentType: value.contentType }
}

function normalizeCloneRequest (value) {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, new Set(['name', 'samples']))) return null
  const name = safeCloneName(value.name)
  if (!name || !Array.isArray(value.samples) || value.samples.length === 0 || value.samples.length > MAX_SAMPLE_COUNT) return null

  let totalBytes = 0
  const samples = []
  for (const sample of value.samples) {
    const normalized = normalizeCloneSample(sample)
    if (!normalized) return null
    totalBytes += normalized.blob.size
    if (totalBytes > MAX_TOTAL_SAMPLE_BYTES) return null
    samples.push(normalized)
  }

  return { name, samples }
}

class ElevenLabsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - ElevenLabs API Key（必填）
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

  /** 构造请求头 — ElevenLabs 使用 xi-api-key */
  _headers() {
    return {
      'xi-api-key': this.credentials.apiKey,
      'Content-Type': 'application/json',
    }
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
    const headers = Object.fromEntries(Object.entries({ ...this._headers(), ...(opts.headers || {}) })
      .filter(([, value]) => value !== undefined && value !== null))

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
        // ElevenLabs 错误格式：{ detail: { message: "..." } } 或 { detail: "string" }
        const message = (errorBody && errorBody.detail && errorBody.detail.message)
          || (errorBody && typeof errorBody.detail === 'string' ? errorBody.detail
          : (typeof errorBody === 'string' ? errorBody : `HTTP ${response.status}`))
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
   * GET /v1/voices — 列出可用声音
   * @returns {Promise<Array<{voice_id, name, ...}>>}
   */
  async listVoices() {
    const resp = await this._request('/v1/voices')
    const body = await resp.json()
    return body.voices || []
  }

  /**
   * GET /v1/models — 列出 TTS 模型
   * @returns {Promise<Array<{model_id, name, ...}>>}
   */
  async listModels() {
    const resp = await this._request('/v1/models')
    return await resp.json()
  }

  /**
   * POST /v1/text-to-speech/{voice_id} — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} params.voiceId - 声音 ID（必填）
   * @param {string} [params.model='eleven_multilingual_v2'] - TTS 模型 ID
   * @param {number} [params.stability] - 稳定性（0-1）
   * @param {number} [params.similarityBoost] - 相似度增强（0-1）
   * @param {string} [params.outputFormat='mp3_44100_128'] - 输出格式
   * @returns {Promise<{audio: ArrayBuffer, format: string, voice: string}>}
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }
    if (!params.voiceId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.voiceId is required')
    }

    const body = {
      text: params.text,
      model_id: params.model || 'eleven_multilingual_v2',
    }

    // voice_settings 可选
    if (params.stability !== undefined || params.similarityBoost !== undefined) {
      body.voice_settings = {
        stability: params.stability !== undefined ? params.stability : 0.5,
        similarity_boost: params.similarityBoost !== undefined ? params.similarityBoost : 0.75,
      }
    }

    const outputFormat = params.outputFormat || DEFAULT_OUTPUT_FORMAT

    const resp = await this._request(
      `/v1/text-to-speech/${params.voiceId}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { output_format: outputFormat }
    )

    const audio = await resp.arrayBuffer()

    // 从 outputFormat 推断格式（mp3_44100_128 → mp3, pcm_24000 → pcm）
    const format = outputFormat.split('_')[0]

    return {
      audio,
      format,
      voice: params.voiceId,
    }
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

  /**
   * 返回支持的能力，规避基础注册表中重复的 deleteVoice 项。
   */
  capabilities() {
    return [...new Set(super.capabilities())]
  }

  /**
   * POST /v1/voices/add — 使用受信 Blob 克隆声音
   *
   * @param {object} params
   * @param {string} params.name - 克隆声音的名称
   * @param {Array<{blob: Blob, fileName: string, contentType: string}>} params.samples - 主进程转换后的音频样本
   * @returns {Promise<{id: string, name: string}>}
   */
  async cloneVoice(params) {
    const request = normalizeCloneRequest(params)
    if (!request) {
      throw new ProviderError(
        ERROR_CODES.INVALID_CONFIG,
        'cloneVoice requires { name, samples: [{ blob: Blob, fileName, contentType }] }',
        { providerId: this.id }
      )
    }

    const form = new FormData()
    form.append('name', request.name)
    for (const sample of request.samples) {
      const file = new Blob([sample.blob], { type: sample.contentType })
      form.append('files', file, sample.fileName)
    }

    const response = await this._request('/v1/voices/add', {
      method: 'POST',
      headers: { 'Content-Type': undefined },
      body: form,
    })

    let body
    try {
      body = await response.json()
    } catch (_) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'ElevenLabs returned an invalid clone voice response',
        { providerId: this.id }
      )
    }

    const responseBody = isPlainRecord(body) ? body : null
    const id = responseBody ? safeVoiceId(responseBody.voice_id) : null
    const providerName = responseBody ? safeCloneName(responseBody.name) : null
    if (!id) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'ElevenLabs returned an invalid clone voice response',
        { providerId: this.id }
      )
    }

    return { id, name: providerName || request.name }
  }

  /**
   * DELETE /v1/voices/{voice_id} — 删除克隆声音
   *
   * @param {string} voiceId
   * @returns {Promise<void>}
   */
  async deleteVoice(voiceId) {
    const id = safeVoiceId(voiceId)
    if (!id) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'voiceId is required and must be a safe voice identifier', {
        providerId: this.id,
      })
    }

    await this._request(`/v1/voices/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
}

module.exports = { ElevenLabsAdapter }
