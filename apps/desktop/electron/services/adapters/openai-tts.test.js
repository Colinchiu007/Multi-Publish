// @ts-check
/**
 * openai-tts.test.js — TDD: OpenAI TTS Adapter 测试
 *
 * 验证：
 * - 构造与配置（继承 OpenAIAdapter）
 * - validateConfig（继承）
 * - 能力协商（supports synthesize/listVoices）
 * - synthesize（POST /audio/speech 返回 audio buffer）
 * - listVoices（静态声音列表，无 HTTP 请求）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（继承自 OpenAIAdapter）
 * - getProviderInfo（继承）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { OpenAITtsAdapter, TTS_VOICES } = require('./openai-tts')
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
    async arrayBuffer() {
      // 对于 audio 响应，返回模拟 buffer
      if (body instanceof ArrayBuffer) return body
      return new ArrayBuffer(16)
    },
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

describe('OpenAITtsAdapter — OpenAI TTS Adapter', () => {
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
      const adapter = new OpenAITtsAdapter({
        id: 'openai-tts',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 3,
      })
      expect(adapter.id).toBe('openai-tts')
      expect(adapter.credentials.apiKey).toBe('sk-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 OpenAI 官方端点', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('apiKey 为 null 时返回 invalid', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: null })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法（synthesize/listVoices）', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      expect(adapter.supports('synthesize')).toBe(true)
      expect(adapter.supports('listVoices')).toBe(true)
    })

    it('继承支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 Image/Video 方法', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('editImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 synthesize 和 listVoices', () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listVoices')
      // 继承自 OpenAIAdapter
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('streamChat')
      expect(caps).toContain('embeddings')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('synthesize', () => {
    it('POST /audio/speech 返回 audio buffer', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(32)),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const result = await adapter.synthesize({
        input: 'Hello world',
        model: 'tts-1',
        voice: 'alloy',
        response_format: 'mp3',
      })

      expect(result.audio).toBeInstanceOf(ArrayBuffer)
      expect(result.audio.byteLength).toBe(32)
      expect(result.format).toBe('mp3')
      expect(result.model).toBe('tts-1')

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/audio/speech')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-test')

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('tts-1')
      expect(body.input).toBe('Hello world')
      expect(body.voice).toBe('alloy')
      expect(body.response_format).toBe('mp3')
    })

    it('voice 默认 alloy，response_format 默认 mp3', async () => {
      const fetchMock = createFetchMock([createFetchResponse(new ArrayBuffer(8))])
      global.fetch = fetchMock

      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      await adapter.synthesize({ input: 'Hi' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice).toBe('alloy')
      expect(body.response_format).toBe('mp3')
    })

    it('model 默认 tts-1', async () => {
      const fetchMock = createFetchMock([createFetchResponse(new ArrayBuffer(8))])
      global.fetch = fetchMock

      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      await adapter.synthesize({ input: 'Hi' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('tts-1')
    })

    it('无 input 参数抛错', async () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      await expect(adapter.synthesize({})).rejects.toThrow(/input.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      await expect(adapter.synthesize()).rejects.toThrow(/input.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-bad' })
      try {
        await adapter.synthesize({ input: 'Hi' })
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
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      try {
        await adapter.synthesize({ input: 'Hi' })
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
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      try {
        await adapter.synthesize({ input: 'Hi' })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('listVoices', () => {
    it('返回静态声音列表（无 HTTP 请求）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock

      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const voices = await adapter.listVoices()

      expect(voices).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage'])
      expect(voices).toEqual(TTS_VOICES)
      // 无 HTTP 请求
      expect(fetchMock.calls).toHaveLength(0)
    })

    it('返回副本，修改不影响内部列表', async () => {
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const voices1 = await adapter.listVoices()
      voices1.push('custom')
      const voices2 = await adapter.listVoices()
      expect(voices2).not.toContain('custom')
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（继承自 OpenAIAdapter，通过 listModels 验证）', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ data: [{ id: 'gpt-4o' }] }),
      ])
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new OpenAITtsAdapter({
        id: 'openai-tts',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('openai-tts')
      expect(info.baseUrl).toBe('https://api.openai.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      try {
        await adapter.synthesize({ input: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      try {
        await adapter.synthesize({ input: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new OpenAITtsAdapter({ id: 'openai-tts', apiKey: 'sk-test' })
      try {
        await adapter.synthesize({ input: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })
})
