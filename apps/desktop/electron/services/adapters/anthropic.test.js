// @ts-check
/**
 * anthropic.test.js — P3.6 TDD: Anthropic Adapter 测试
 *
 * 验证 Anthropic API 的关键差异：
 * - 认证头 x-api-key + anthropic-version（非 Bearer）
 * - Messages API POST /v1/messages（非 /chat/completions）
 * - 请求 max_tokens 必填、system 独立字段
 * - 响应 content 数组格式 [{ type: 'text', text: '...' }]
 * - 不支持 embeddings（Anthropic 无此 API）
 * - testConnection 通过最小 messages 请求验证（无 /models 端点）
 * - 流式 SSE 格式：event: content_block_delta + delta.text
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { AnthropicAdapter } = require('./anthropic')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { BaseAdapter, ADAPTER_VERSION } = require('./_base/base')

// ─── fetch mock 工具（复用 openai.test.js 模式）───
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

// ─── 流式响应 mock（SSE）───
function createStreamResponse(sseChunks, status = 200) {
  // sseChunks: Array<string|Uint8Array> 每次 reader.read() 返回一块
  const encoder = new TextEncoder()
  const encoded = sseChunks.map(c => (c instanceof Uint8Array ? c : encoder.encode(c)))
  let index = 0
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    async json() { return {} },
    async text() { return '' },
    body: {
      getReader() {
        return {
          async read() {
            if (index < encoded.length) {
              const value = encoded[index]
              index++
              return { done: false, value }
            }
            return { done: true, value: undefined }
          },
        }
      },
    },
  }
}

describe('AnthropicAdapter — P3.6 第二个 LLM Adapter', () => {
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
      const adapter = new AnthropicAdapter({
        id: 'anthropic',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://api.anthropic.com',
      }, {
        timeout: 60000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('anthropic')
      expect(adapter.credentials.apiKey).toBe('sk-ant-test')
      expect(adapter.credentials.baseUrl).toBe('https://api.anthropic.com')
      expect(adapter.options.timeout).toBe(60000)
    })

    it('默认 baseUrl 为 Anthropic 官方端点', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.anthropic.com')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('apiKey 为 null 时返回 invalid', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: null })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 LLM 方法（chatCompletion/streamChat）', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 embeddings（Anthropic 无此 API）', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.supports('embeddings')).toBe(false)
    })

    it('不支持 TTS/Image/Video 方法', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 LLM 相关方法但不含 embeddings', () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('streamChat')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('embeddings')
    })
  })

  describe('认证头（关键差异：x-api-key + anthropic-version）', () => {
    it('请求头使用 x-api-key 而非 Bearer', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['x-api-key']).toBe('sk-ant-test')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('chatCompletion', () => {
    it('POST /v1/messages 返回文本', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 7 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('Hello from Claude!')
      expect(result.model).toBe('claude-sonnet-4-20250514')
      expect(result.usage.total_tokens).toBe(17)

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('claude-sonnet-4-20250514')
      expect(body.messages).toHaveLength(1)
      expect(body.max_tokens).toBeDefined()
    })

    it('max_tokens 默认 4096（Anthropic 必填）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.max_tokens).toBe(4096)
    })

    it('支持自定义 max_tokens', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 200,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.max_tokens).toBe(200)
    })

    it('system 消息提取为独立字段（非 messages 数组）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.system).toBe('You are helpful.')
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe('user')
    })

    it('无 messages 参数抛错误', async () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await expect(adapter.chatCompletion({ model: 'claude-sonnet-4-20250514' }))
        .rejects.toThrow(/messages.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ type: 'error', error: { type: 'authentication_error', message: 'Invalid API key' } }, 401),
      ])
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-bad' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED, retryable=true)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } }, 429),
      ])
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ type: 'error', error: { type: 'api_error', message: 'Internal error' } }, 500),
      ])
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（通过最小 messages 请求）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_test',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      // 验证发送了最小请求
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.max_tokens).toBe(1)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ type: 'error', error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('baseUrl 自定义（兼容代理）', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({
        id: 'anthropic-proxy',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://my-proxy.com/anthropic',
      })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('api.anthropic.com')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new AnthropicAdapter({
        id: 'anthropic',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://api.anthropic.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('anthropic')
      expect(info.baseUrl).toBe('https://api.anthropic.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  // ─── P3.6 质量节拍补跑：步骤② 边界场景补充 ───

  describe('streamChat — P3.6 补跑：SSE 流式解析（原 CRITICAL 缺口）', () => {
    it('无 onChunk 回调抛错误', async () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await expect(adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })).rejects.toThrow(/onChunk.*required/i)
    })

    it('无 messages 参数抛错误', async () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await expect(adapter.streamChat({}, () => {}))
        .rejects.toThrow(/messages.*required/i)
    })

    it('请求体包含 stream: true', async () => {
      const fetchMock = createFetchMock([
        createStreamResponse(['data: [DONE]\n']),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, () => {})

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.stream).toBe(true)
      expect(body.max_tokens).toBe(4096)
    })

    it('content_block_delta 事件触发 onChunk 回调', async () => {
      const sseLines = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
        '\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n',
        '\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      expect(chunks).toEqual(['Hello', ' World'])
    })

    it('[DONE] 标记提前终止流', async () => {
      const sseLines = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\n',
        'data: [DONE]\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"B"}}\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      // [DONE] 后的 chunk 不应触发
      expect(chunks).toEqual(['A'])
    })

    it('非 content_block_delta 事件不触发 onChunk', async () => {
      const sseLines = [
        'data: {"type":"message_start","message":{"id":"msg_1"}}\n',
        'data: {"type":"content_block_start","index":0}\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n',
        'data: {"type":"content_block_stop","index":0}\n',
        'data: {"type":"message_stop"}\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      expect(chunks).toEqual(['Hi'])
    })

    it('解析失败的 data 行被静默忽略（不抛错）', async () => {
      const sseLines = [
        'data: {invalid json\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      expect(chunks).toEqual(['OK'])
    })

    it('非 data: 开头的行被忽略', async () => {
      const sseLines = [
        'event: content_block_delta\n',
        ': comment line\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"X"}}\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      expect(chunks).toEqual(['X'])
    })

    it('响应 body 无 getReader → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = createFetchMock([createFetchResponse({})]) // body: null

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.streamChat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        }, () => {})
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('跨 chunk 的 SSE 行能正确拼接', async () => {
      // 一个 data 行被拆成两个 read() chunk
      const sseLines = [
        'data: {"type":"content_block_delta","delta":',
        '{"type":"text_delta","text":"Split"}}\n',
      ]
      global.fetch = createFetchMock([createStreamResponse(sseLines)])

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const chunks = []
      await adapter.streamChat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      }, (text) => chunks.push(text))

      expect(chunks).toEqual(['Split'])
    })
  })

  describe('chatCompletion — 多 block 与边界（P3.6 补跑）', () => {
    it('多个 text block 被合并为单个字符串', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          content: [
            { type: 'text', text: 'Part1 ' },
            { type: 'text', text: 'Part2' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 4 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('Part1 Part2')
    })

    it('非 text block（如 tool_use）被过滤', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          content: [
            { type: 'text', text: 'Thinking...' },
            { type: 'tool_use', id: 'tu_1', name: 'get_weather', input: {} },
            { type: 'text', text: 'Done' },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 5, output_tokens: 4 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('Thinking...Done')
    })

    it('空 content 数组返回空字符串', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          id: 'msg_123',
          content: [],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 0 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      const result = await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('')
    })

    it('多个 system 消息被合并（换行连接）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'Rule 1.' },
          { role: 'system', content: 'Rule 2.' },
          { role: 'user', content: 'Hi' },
        ],
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.system).toBe('Rule 1.\nRule 2.')
      expect(body.messages).toHaveLength(1)
    })

    it('无 model 参数抛错误', async () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await expect(adapter.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      })).rejects.toThrow(/model.*required/i)
    })

    it('messages 非数组抛错误', async () => {
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      await expect(adapter.chatCompletion({
        model: 'claude-sonnet-4-20250514',
        messages: 'not an array',
      })).rejects.toThrow(/messages.*required.*array/i)
    })
  })

  describe('错误响应边界（P3.6 补跑）', () => {
    it('非 JSON 错误响应（纯文本）→ ProviderError', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway plain text' },
      }))
      global.fetch = fetchMock

      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('Bad Gateway plain text')
      }
    })

    it('错误响应 JSON 无 error 字段 → HTTP 状态码消息', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ unrelated: 'field' }, 500),
      ])
      const adapter = new AnthropicAdapter({ id: 'anthropic', apiKey: 'sk-ant-test' })
      try {
        await adapter.chatCompletion({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('500')
      }
    })
  })
})
