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

  // ─── P3.1 质量节拍补跑：streamChat SSE 流式解析（CRITICAL 缺口） ───
  describe('P3.1 补跑：streamChat SSE 流式解析', () => {
    function createStreamResponse(sseChunks, status = 200) {
      const encoder = new TextEncoder()
      const chunks = sseChunks.map(c => encoder.encode(c))
      let idx = 0
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Map(),
        async json() { return {} },
        async text() { return '' },
        body: {
          getReader() {
            return {
              read: async () => {
                if (idx < chunks.length) {
                  return { done: false, value: chunks[idx++] }
                }
                return { done: true, value: undefined }
              },
            }
          },
        },
      }
    }

    it('streamChat 触发 onChunk 回调', async () => {
      global.fetch = createFetchMock([
        createStreamResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Hi' }] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['Hello', ' world'])
    })

    it('streamChat 请求体包含 stream:true', async () => {
      const fetchMock = createFetchMock([
        createStreamResponse(['data: [DONE]\n\n']),
      ])
      global.fetch = fetchMock
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await adapter.streamChat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Hi' }] }, () => {})
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.stream).toBe(true)
    })

    it('streamChat [DONE] 终止流', async () => {
      global.fetch = createFetchMock([
        createStreamResponse([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: [DONE]\n\n',
          'data: {"choices":[{"delta":{"content":"不应到达"}}]}\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['Hi'])
    })

    it('streamChat 非 data: 行忽略', async () => {
      global.fetch = createFetchMock([
        createStreamResponse([
          ': comment\n',
          'event: ping\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['ok'])
    })

    it('streamChat JSON 解析失败静默忽略', async () => {
      global.fetch = createFetchMock([
        createStreamResponse([
          'data: {invalid json}\n\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['ok'])
    })

    it('streamChat 无 onChunk 回调抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.streamChat({ model: 'gpt-4o', messages: [] }))
        .rejects.toThrow(/onChunk.*required/i)
    })

    it('streamChat 无 messages 抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.streamChat({ model: 'gpt-4o' }, () => {}))
        .rejects.toThrow(/messages.*required/i)
    })

    it('streamChat 无 getReader 抛 NETWORK_ERROR', async () => {
      global.fetch = createFetchMock([{
        ok: true,
        status: 200,
        headers: new Map(),
        body: null, // 无 body
      }])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.streamChat({ model: 'gpt-4o', messages: [] }, () => {}))
        .rejects.toThrow(/not readable/i)
    })

    it('streamChat 跨 chunk SSE 行拼接', async () => {
      // 一个 SSE 行被分割到两个 chunk
      global.fetch = createFetchMock([
        createStreamResponse([
          'data: {"choices":[{"delta":', // 不完整
          '{"content":"Hi"}}]}\n\n', // 补全
          'data: [DONE]\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['Hi'])
    })

    it('streamChat delta 无 content 字段忽略', async () => {
      global.fetch = createFetchMock([
        createStreamResponse([
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const chunks = []
      await adapter.streamChat({ model: 'gpt-4o', messages: [] }, (c) => chunks.push(c))
      expect(chunks).toEqual(['Hi'])
    })
  })

  // ─── P3.1 补跑：chatCompletion 边界 ───
  describe('P3.1 补跑：chatCompletion 边界', () => {
    it('无 model 参数抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.chatCompletion({ messages: [] }))
        .rejects.toThrow(/model.*required/i)
    })

    it('messages 非数组抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.chatCompletion({ model: 'gpt-4o', messages: 'not array' }))
        .rejects.toThrow(/messages.*required.*array/i)
    })

    it('choices 空数组返回空 content', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ choices: [], usage: { total_tokens: 0 } }),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = await adapter.chatCompletion({ model: 'gpt-4o', messages: [] })
      expect(result.content).toBe('')
      expect(result.finish_reason).toBeNull()
    })

    it('无 usage 字段返回默认值', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({
          choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
        }),
      ])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const result = await adapter.chatCompletion({ model: 'gpt-4o', messages: [] })
      expect(result.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
    })

    it('错误响应为非 JSON 纯文本', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway' },
      }))
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.chatCompletion({ model: 'gpt-4o', messages: [] })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.message).toBe('Bad Gateway')
      }
    })

    it('错误响应 JSON 无 error 字段', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        headers: new Map(),
        async json() { return { detail: 'something' } }, // 无 error.message
        async text() { return JSON.stringify({ detail: 'something' }) },
      }))
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.chatCompletion({ model: 'gpt-4o', messages: [] })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.message).toMatch(/HTTP 500/)
      }
    })
  })

  // ─── P3.1 补跑：embeddings 边界 ───
  describe('P3.1 补跑：embeddings 边界', () => {
    it('无 input 参数抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.embeddings({ model: 'text-embedding-3-small' }))
        .rejects.toThrow(/input.*required/i)
    })

    it('无 model 参数抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.embeddings({ input: 'hello' }))
        .rejects.toThrow(/model.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      await expect(adapter.embeddings()).rejects.toThrow(/input.*required/i)
    })
  })

  // ─── P3.1 补跑：listModels 边界 ───
  describe('P3.1 补跑：listModels 边界', () => {
    it('空 data 数组返回空数组', async () => {
      global.fetch = createFetchMock([createFetchResponse({ data: [] })])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })

    it('无 data 字段返回空数组', async () => {
      global.fetch = createFetchMock([createFetchResponse({ object: 'list' })])
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })
  })

  // ─── P3.1 补跑：_url 末尾斜杠 ───
  describe('P3.1 补跑：_url 末尾斜杠处理', () => {
    it('baseUrl 末尾有斜杠时正确拼接', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [] })])
      global.fetch = fetchMock
      const adapter = new OpenAIAdapter({
        id: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1/', // 末尾斜杠
      })
      await adapter.listModels()
      // 不应出现双斜杠
      expect(fetchMock.calls[0].url).not.toContain('//models')
      expect(fetchMock.calls[0].url).toContain('/v1/models')
    })
  })

  // ─── P3.1 补跑：网络错误分类 ───
  describe('P3.1 补跑：网络错误分类', () => {
    it('ENOTFOUND → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ENOTFOUND api.openai.com') })
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })

    it('未知网络错误 → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('Some weird error') })
      const adapter = new OpenAIAdapter({ id: 'openai', apiKey: 'sk-test' })
      try {
        await adapter.listModels()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
