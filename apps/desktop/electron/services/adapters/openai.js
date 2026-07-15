// @ts-check
/**
 * openai.js — P3.1 OpenAI Adapter（第一个具体 Adapter）
 *
 * 覆盖 80% LLM 用量的参考实现，其他 Adapter 以此为模板。
 *
 * 实现的方法（capabilities）：
 *   - listModels()         GET /models
 *   - testConnection()     通过 listModels 验证连接
 *   - chatCompletion()     POST /chat/completions
 *   - streamChat()         POST /chat/completions (stream=true, SSE)
 *   - embeddings()         POST /embeddings
 *
 * 兼容性：支持 OpenAI 官方 API + OpenRouter + 任何 OpenAI 兼容端点
 *
 * 设计决策（devex review 2.3/3.1/7.1）：
 * - credentials/options 分离（BaseAdapter 约定）
 * - validateConfig 检查 apiKey 必填
 * - 错误统一抛 ProviderError（含 code/category/retryable）
 * - 网络错误区分 TIMEOUT 和 NETWORK_ERROR
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TIMEOUT = 30000

class OpenAIAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - OpenAI API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点（OpenRouter 等）
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - 请求超时（ms）
   * @param {number} [options.maxRetries=3] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 3
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

  /** 构造请求头 */
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
   * @param {string} path - API 路径（如 /chat/completions）
   * @param {object} [opts={}] - fetch 选项
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
        // 解析错误响应体
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

      // 网络错误分类
      const msg = e.message || String(e)
      if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('aborted')) {
        throw new ProviderError(ERROR_CODES.TIMEOUT, msg, { providerId: this.id })
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
        throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
      }
      // 其他未知错误归为 NETWORK_ERROR
      throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
    }
  }

  /** GET /models — 列出可用模型 */
  async listModels() {
    const resp = await this._request('/models')
    const body = await resp.json()
    return body.data || []
  }

  /**
   * POST /chat/completions — 聊天补全
   * @param {object} params
   * @param {string} params.model - 模型 ID（如 gpt-4o）
   * @param {Array} params.messages - 消息数组
   * @param {number} [params.temperature] - 温度
   * @param {number} [params.max_tokens] - 最大 token 数
   */
  async chatCompletion(params) {
    if (!params || !params.messages || !Array.isArray(params.messages)) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required and must be an array')
    }
    if (!params.model) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.model is required')
    }

    const body = {
      model: params.model,
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
      model: data.model || params.model,
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
   * @param {function} onChunk - 每个 chunk 的回调 (chunk) => void
   */
  async streamChat(params, onChunk) {
    if (typeof onChunk !== 'function') {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'onChunk callback is required')
    }
    if (!params || !params.messages) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.messages is required')
    }

    const body = {
      model: params.model,
      messages: params.messages,
      stream: true,
    }
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens

    const resp = await this._request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    // 解析 SSE 流
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

  /**
   * POST /embeddings — 文本向量化
   * @param {object} params
   * @param {string} params.model - 模型（如 text-embedding-3-small）
   * @param {string} params.input - 输入文本
   */
  async embeddings(params) {
    if (!params || !params.input) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.input is required')
    }
    if (!params.model) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.model is required')
    }

    const resp = await this._request('/embeddings', {
      method: 'POST',
      body: JSON.stringify({
        model: params.model,
        input: params.input,
      }),
    })
    return await resp.json()
  }

  /** 测试连接 — 通过 listModels 验证 */
  async testConnection() {
    try {
      const models = await this.listModels()
      return { success: true, models: models.length }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { OpenAIAdapter }
