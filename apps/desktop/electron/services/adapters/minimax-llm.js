// @ts-check
/**
 * minimax-llm.js — MiniMax 文字推理（LLM）Adapter
 *
 * 依据 MiniMax 官方文档《文本生成 / 模型调用》
 * （https://platform.minimaxi.com/docs/guides/text-generation）：
 *   - 接口：POST {base_url}/chat/completions（OpenAI 兼容）
 *   - base_url：https://api.minimaxi.com/v1
 *   - 认证：Bearer token（与 TTS/生图/视频共用同一 API Key）
 *   - 模型：MiniMax-M3（最新，1M 上下文）/ MiniMax-M2.7 / MiniMax-M2.5 / MiniMax-M2.1 / MiniMax-M2
 *
 * 与多模态预设共用同一适配器委托策略：多模态 MiniMax 的文字推理能力
 * 走与单类型模型完全相同的调用方法（chatCompletion / streamChat）。
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'MiniMax-M2.7'

const MINIMAX_LLM_MODELS = [
  { id: 'MiniMax-M3', name: 'MiniMax-M3', description: '最新 M 系列语言模型，1M 上下文，Agent 推理/工具调用/代码' },
  { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', description: '自我迭代模型，204K 上下文（约 60 TPS）' },
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-highspeed', description: 'M2.7 极速版（约 100 TPS）' },
  { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', description: '高性能性价比模型，204K 上下文' },
  { id: 'MiniMax-M2', name: 'MiniMax-M2', description: '基础语言模型，204K 上下文' },
]

class MinimaxLlmAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

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
   * POST /chat/completions — 聊天补全（OpenAI 兼容）
   * @param {object} params
   * @param {string} params.model - 模型 ID（默认 MiniMax-M2.7）
   * @param {Array} params.messages - 消息数组
   * @param {number} [params.temperature]
   * @param {number} [params.max_tokens]
   */
  async chatCompletion(params) {
    if (!params || !params.messages || !Array.isArray(params.messages)) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required and must be an array')
    }
    const body = {
      model: params.model || DEFAULT_MODEL,
      messages: params.messages,
    }
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens

    const resp = await this._request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    return {
      id: data.id,
      model: data.model || body.model,
      content: data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '',
      finish_reason: data.choices && data.choices[0] ? data.choices[0].finish_reason : null,
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
  }

  /**
   * POST /chat/completions (stream=true) — 流式聊天
   * @param {object} params - 同 chatCompletion
   * @param {function} onChunk - 每个内容 chunk 的回调
   */
  async streamChat(params, onChunk) {
    if (typeof onChunk !== 'function') {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'onChunk callback is required')
    }
    if (!params || !params.messages || !Array.isArray(params.messages)) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required and must be an array')
    }
    const body = {
      model: params.model || DEFAULT_MODEL,
      messages: params.messages,
      stream: true,
    }
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens

    const resp = await this._request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null
    if (!reader) {
      throw new ProviderError(ERROR_CODES.NETWORK_ERROR, 'Response body is not readable stream')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return
        try {
          const chunk = JSON.parse(data)
          const content = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
            ? chunk.choices[0].delta.content : ''
          if (content) onChunk(content)
        } catch (_) { /* 忽略解析失败的 chunk */ }
      }
    }
  }

  async listModels() {
    return MINIMAX_LLM_MODELS.map(m => ({ ...m }))
  }

  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return { success: false, error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')) }
    }
    // 用最小 chat 请求验证 Key 与网络链路
    try {
      await this._request('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      })
      return { success: true }
    } catch (e) {
      if (e instanceof ProviderError && (e.code === ERROR_CODES.RATE_LIMITED || e.code === ERROR_CODES.PROVIDER_ERROR)) {
        return { success: true }
      }
      return { success: false, error: e }
    }
  }
}

module.exports = { MinimaxLlmAdapter, MINIMAX_LLM_MODELS, DEFAULT_MODEL }
