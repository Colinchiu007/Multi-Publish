// @ts-check
/**
 * openrouter.test.js — TDD: OpenRouter Adapter 测试
 *
 * 验证：
 * - 构造与配置（继承 OpenAICompatibleAdapter）
 * - validateConfig（apiKey 可空时仍 valid，baseUrl 必填）
 * - getProviderInfo 返回正确 id
 * - 能力协商（supports LLM 方法）
 * - listModels（GET /models）
 * - chatCompletion（POST /chat/completions）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { OpenRouterAdapter } = require('./openrouter')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { ADAPTER_VERSION } = require('./_base/base')

// ─── fetch mock 工具 ───
function createFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
    async arrayBuffer() { return new ArrayBuffer(0) },
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

describe('OpenRouterAdapter — OpenRouter LLM Adapter', () => {
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
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      }, {
        timeout: 30000,
        maxRetries: 3,
      })
      expect(adapter.id).toBe('openrouter')
      expect(adapter.credentials.apiKey).toBe('sk-or-test')
      expect(adapter.credentials.baseUrl).toBe('https://openrouter.ai/api/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey + baseUrl 时返回 valid', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时仍 valid（OpenAI 兼容协议，apiKey 可空）', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('apiKey 为空字符串时仍 valid', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('openrouter')
      expect(info.baseUrl).toBe('https://openrouter.ai/api/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('能力协商', () => {
    it('支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 TTS/Image/Video 方法', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 包含 chatCompletion', () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
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
            { id: 'openai/gpt-4o' },
            { id: 'anthropic/claude-3.5-sonnet' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const models = await adapter.listModels()
      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('openai/gpt-4o')

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('openrouter.ai')
      expect(fetchMock.calls[0].url).toContain('/models')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-or-test')
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-bad',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
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
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Internal error' } }, 500),
      ])
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
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

      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = await adapter.chatCompletion({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('Hello!')
      expect(result.model).toBe('openai/gpt-4o')
      expect(result.usage.total_tokens).toBe(15)

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('openai/gpt-4o')
      expect(body.messages).toHaveLength(1)

      // 验证 URL 和 Authorization
      expect(fetchMock.calls[0].url).toContain('openrouter.ai')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-or-test')
    })

    it('无 messages 参数抛错', async () => {
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      await expect(adapter.chatCompletion({ model: 'openai/gpt-4o' }))
        .rejects.toThrow(/messages.*required/i)
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ data: [{ id: 'openai/gpt-4o' }] }),
      ])
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new OpenRouterAdapter({
        id: 'openrouter',
        apiKey: 'sk-bad',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })
})
