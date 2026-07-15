// @ts-check
/**
 * anthropic.js — P3.6 Anthropic Adapter（第二个 LLM Adapter）
 *
 * 验证 Adapter 架构对非 OpenAI 兼容供应商的扩展性。
 *
 * Anthropic API 关键差异（vs OpenAI）：
 * - 认证头 x-api-key + anthropic-version（非 Bearer Authorization）
 * - Messages API POST /v1/messages（非 /chat/completions）
 * - max_tokens 必填（OpenAI 可选）
 * - system 消息为独立字段（非 messages 数组中的 role:system）
 * - 响应 content 数组格式 [{ type: 'text', text: '...' }]（非 choices[0].message.content）
 * - 无 /models 端点（testConnection 通过最小 messages 请求验证）
 * - 无 /embeddings 端点
 * - 流式 SSE 格式：event: content_block_delta + delta.text（非 data: choices[0].delta.content）
 *
 * 实现的方法（capabilities）：
 *   - chatCompletion()     POST /v1/messages
 *   - streamChat()         POST /v1/messages (stream=true, SSE)
 *   - testConnection()     通过 max_tokens=1 的最小请求验证
 *
 * 设计决策：
 * - 不覆盖 embeddings()（BaseAdapter 默认抛 NotImplementedError → supports() 返回 false）
 * - 不覆盖 listModels()（Anthropic 无公开 /models 端点）
 * - system 消息自动提取到顶层 system 字段
 * - max_tokens 默认 4096（Anthropic 必填，不同于 OpenAI 可选）
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_MAX_TOKENS = 4096
const ANTHROPIC_VERSION = '2023-06-01'

class AnthropicAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Anthropic API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点（代理等）
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

  /** 构造请求头 — Anthropic 使用 x-api-key + anthropic-version */
  _headers() {
    return {
      'x-api-key': this.credentials.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
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
   * 复用 OpenAI Adapter 的错误分类逻辑
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
   * 从 messages 数组中提取 system 消息
   * Anthropic 要求 system 为独立字段，不在 messages 数组中
   * @private
   */
  _extractSystem(messages) {
    const systemMessages = messages.filter(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    const system = systemMessages.map(m => m.content).join('\n')
    return { system: system || undefined, messages: nonSystemMessages }
  }

  /**
   * POST /v1/messages — 聊天补全
   * @param {object} params
   * @param {string} params.model - 模型 ID（如 claude-sonnet-4-20250514）
   * @param {Array} params.messages - 消息数组（可含 system role，自动提取）
   * @param {number} [params.max_tokens=4096] - 最大 token 数（Anthropic 必填）
   * @param {number} [params.temperature] - 温度
   */
  async chatCompletion(params) {
    if (!params || !params.messages || !Array.isArray(params.messages)) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required and must be an array')
    }
    if (!params.model) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.model is required')
    }

    // 提取 system 消息到独立字段
    const { system, messages } = this._extractSystem(params.messages)

    const body = {
      model: params.model,
      messages,
      max_tokens: params.max_tokens || DEFAULT_MAX_TOKENS,
    }
    if (system) body.system = system
    if (params.temperature !== undefined) body.temperature = params.temperature

    const resp = await this._request('/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // Anthropic 响应格式：content 是数组 [{ type: 'text', text: '...' }]
    const textBlocks = (data.content || []).filter(b => b.type === 'text')
    const content = textBlocks.map(b => b.text).join('')

    return {
      id: data.id,
      model: params.model,
      content,
      finish_reason: data.stop_reason || null,
      usage: {
        prompt_tokens: (data.usage && data.usage.input_tokens) || 0,
        completion_tokens: (data.usage && data.usage.output_tokens) || 0,
        total_tokens: ((data.usage && data.usage.input_tokens) || 0) + ((data.usage && data.usage.output_tokens) || 0),
      },
    }
  }

  /**
   * POST /v1/messages (stream=true) — 流式聊天
   * Anthropic SSE 格式：
   *   event: content_block_delta
   *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
   *
   * @param {object} params - 同 chatCompletion
   * @param {function} onChunk - 每个 text chunk 的回调 (text) => void
   */
  async streamChat(params, onChunk) {
    if (typeof onChunk !== 'function') {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'onChunk callback is required')
    }
    if (!params || !params.messages) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required')
    }

    const { system, messages } = this._extractSystem(params.messages)

    const body = {
      model: params.model,
      messages,
      max_tokens: params.max_tokens || DEFAULT_MAX_TOKENS,
      stream: true,
    }
    if (system) body.system = system
    if (params.temperature !== undefined) body.temperature = params.temperature

    const resp = await this._request('/v1/messages', {
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
          // Anthropic 流式格式：delta.text
          if (chunk.type === 'content_block_delta' && chunk.delta && chunk.delta.text) {
            onChunk(chunk.delta.text)
          }
        } catch (_) { /* 忽略解析失败的 chunk */ }
      }
    }
  }

  /**
   * 测试连接 — 通过 max_tokens=1 的最小 messages 请求验证
   * Anthropic 无 /models 端点，用最小请求验证认证和连通性
   */
  async testConnection() {
    try {
      await this._request('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { AnthropicAdapter }
