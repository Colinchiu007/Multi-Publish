// @ts-check
/**
 * openai-whisper.js — OpenAI Whisper STT Adapter（语音转文字）
 *
 * 继承 OpenAIAdapter，新增 transcribe 方法（不在 KNOWN_METHODS 中）：
 *   - transcribe()    POST /audio/transcriptions 返回 { text, language, duration }
 *
 * OpenAI Whisper API 关键特性：
 * - 认证头 Authorization: Bearer {key}（继承自 OpenAIAdapter）
 * - transcribe: POST /audio/transcriptions，请求体 FormData（multipart/form-data）
 * - FormData 字段: file（音频文件）, model, language?
 * - model 默认 'whisper-1'
 * - 返回 { text, language, duration }（OpenAI 响应格式）
 *
 * 设计决策：
 * - transcribe 不在 KNOWN_METHODS 中，直接定义为实例方法
 * - supports('transcribe') 不会自动检测，需覆盖 supports() 手动返回 true
 * - capabilities() 需覆盖以手动添加 'transcribe'
 * - FormData 请求需移除默认 Content-Type，让 fetch 自动设置 multipart boundary
 * - 新增 _formRequest 私有方法处理 FormData 请求的错误转换
 */

const { OpenAIAdapter } = require('./openai')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_MODEL = 'whisper-1'

class OpenAIWhisperAdapter extends OpenAIAdapter {
  /**
   * POST /audio/transcriptions — 语音转文字
   *
   * @param {object} params
   * @param {Buffer|Blob|File} params.file - 音频文件（必填）
   * @param {string} [params.model='whisper-1'] - Whisper 模型 ID
   * @param {string} [params.language] - 语言代码（如 'zh'/'en'），可选
   * @returns {Promise<{text: string, language?: string, duration?: number}>}
   */
  async transcribe(params) {
    if (!params || !params.file) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.file is required')
    }

    const model = params.model || DEFAULT_MODEL
    const form = new FormData()
    form.append('file', params.file)
    form.append('model', model)
    if (params.language) {
      form.append('language', params.language)
    }

    const resp = await this._formRequest('/audio/transcriptions', form)
    const data = await resp.json()

    return {
      text: data.text || '',
      language: data.language,
      duration: data.duration,
    }
  }

  /**
   * FormData 请求专用 — 移除 Content-Type 让 fetch 自动设置 multipart/form-data; boundary
   * 用于文件上传类端点（/audio/transcriptions）
   */
  async _formRequest(path, formData) {
    const url = this._url(path)
    const headers = { ...this._headers() }
    delete headers['Content-Type']  // 让 fetch 自动设置 multipart boundary

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
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
   * supports — 覆盖以支持 'transcribe'（不在 KNOWN_METHODS 中）
   */
  supports(method) {
    if (method === 'transcribe') {
      return typeof this.transcribe === 'function'
    }
    return super.supports(method)
  }

  /**
   * capabilities — 覆盖以手动添加 'transcribe'
   */
  capabilities() {
    const caps = super.capabilities()
    if (this.supports('transcribe') && !caps.includes('transcribe')) {
      caps.push('transcribe')
    }
    return caps
  }
}

module.exports = { OpenAIWhisperAdapter }
