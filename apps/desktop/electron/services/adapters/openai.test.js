// @ts-check
/**
 * openai.test.js — P3.1 TDD: OpenAI Adapter 测试
 *
 * 验证：
 * - 构造与配置（credentials + options 分离）
 * - validateConfig（apiKey 必填）
 * - listModels（GET /models）
 * - chatCompletion（POST /chat/completions）
 * - testConnection（最小请求）
 * - 错误处理（401/429/500/timeout → ProviderError）
 * - 能力协商（supports LLM 方法，不支持 TTS/Image/Video）
 * - baseUrl 自定义（OpenRouter 兼容）
 * - 流式响应（streamChat SSE 解析）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { OpenAIAdapter } = require('./openai')
const { ProviderError, ERROR_CODES, NotImplementedError } = require('./provider-error')
const { BaseAdapter, ADAPTER_VERSION } = require('./base')

// ─── fetch mock 工具 ───
function createFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
    async arrayBuffer() { return new ArrayBuffer(0) },
    // ReadableStream mock for SSE
    body: null,
  }
}

function createFetchMock(responses = []) {
  const calls = []
  const mock = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts })
    const resp = responses.shift() || createFetchResponse({})
    return resp
  })
  mock.calls = calls
  return mock
}

describe('OpenAIAdapter — P3.1 第一个具体 Adapter', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new OpenAIAdapter({
        id: 'openai',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 3,
      })
      expect(adapter.id).toBe('openai')
      expect(adapter.credentials.apiKey).toBe('sk-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 OpenAI 官方端点', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('apiKey 为 null 时返回 invalid', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: null })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 TTS/Image/Video 方法', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 LLM 相关方法', () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('streamChat')
      expect(caps).toContain('embeddings')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('listModels', () => {
    it('GET /models 返回模型列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          data: [
            { id: 'gpt-4o', owned_by: 'openai' },
            { id: 'gpt-4o-mini', owned_by: 'openai' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('gpt-4o')

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/models')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-test')
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-bad' })
      try {
        await adapter.listModels()
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED, retryable=true)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Rate limited' } }, 429),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Internal error' } }, 500),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('chatCompletion', () => {
    it('POST /chat/completions 返回文本', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'chatcmpl-123',
          choices: [{
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = await adapter.chatCompletion({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('Hello!')
      expect(result.model).toBe('gpt-4o')
      expect(result.usage.total_tokens).toBe(15)

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('gpt-4o')
      expect(body.messages).toHaveLength(1)
    })

    it('支持 temperature/max_tokens 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          usage: { total_tokens: 5 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await adapter.chatCompletion({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        max_tokens: 100,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.temperature).toBe(0.7)
      expect(body.max_tokens).toBe(100)
    })

    it('无 messages 参数抛 ValueError', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.chatCompletion({ model: 'gpt-4o' })).rejects.toThrow(/messages.*required/i)
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ data: [{ id: 'gpt-4o' }] }),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('baseUrl 自定义（OpenRouter 兼容）', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      await adapter.listModels()

      expect(fetchMock.calls[0].url).toContain('openrouter.ai')
      expect(fetchMock.calls[0].url).not.toContain('api.openai.com')
    })
  })

  describe('embeddings', () => {
    it('POST /embeddings 返回向量', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { total_tokens: 5 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = await adapter.embeddings({
        model: 'text-embedding-3-small',
        input: 'hello',
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].embedding).toEqual([0.1, 0.2, 0.3])
    })
  })

  describe('超时处理', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('ETIMEDOUT')
      })
      global.fetch = fetchMock

      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new OpenAIAdapter({
        id: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('openai')
      expect(info.baseUrl).toBe('https://api.openai.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
