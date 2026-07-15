// @ts-check
/**
 * openai-whisper.test.js — TDD: OpenAI Whisper STT Adapter 测试
 *
 * 验证：
 * - 构造与配置（继承 OpenAIAdapter）
 * - validateConfig（继承）
 * - 能力协商（supports transcribe 手动检测，capabilities 手动添加）
 * - transcribe（POST /audio/transcriptions 返回 text/language/duration）
 * - FormData 请求验证（file/model/language 字段）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（继承自 OpenAIAdapter）
 * - getProviderInfo（继承）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { OpenAIWhisperAdapter } = require('./openai-whisper')
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

describe('OpenAIWhisperAdapter — OpenAI Whisper STT Adapter', () => {
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
      const adapter = new OpenAIWhisperAdapter({
        id: 'openai-whisper',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 3,
      })
      expect(adapter.id).toBe('openai-whisper')
      expect(adapter.credentials.apiKey).toBe('sk-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 OpenAI 官方端点', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('apiKey 为 null 时返回 invalid', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: null })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 transcribe（手动检测，不在 KNOWN_METHODS 中）', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      expect(adapter.supports('transcribe')).toBe(true)
    })

    it('继承支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 TTS/Image/Video 方法', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('listVoices')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('editImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 包含 transcribe', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('transcribe')
      // 继承自 OpenAIAdapter
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('streamChat')
      expect(caps).toContain('embeddings')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })

    it('capabilities() 中 transcribe 不重复', () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      const transcribeCount = caps.filter(c => c === 'transcribe').length
      expect(transcribeCount).toBe(1)
    })
  })

  describe('transcribe', () => {
    it('POST /audio/transcriptions 返回 { text, language, duration }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          text: 'Hello world',
          language: 'english',
          duration: 5.23,
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['fake audio'], { type: 'audio/mp3' })
      const result = await adapter.transcribe({
        file: fakeFile,
        model: 'whisper-1',
        language: 'en',
      })

      expect(result.text).toBe('Hello world')
      expect(result.language).toBe('english')
      expect(result.duration).toBe(5.23)

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/audio/transcriptions')

      // 验证 FormData
      const body = fetchMock.calls[0].opts.body
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('model')).toBe('whisper-1')
      expect(body.get('language')).toBe('en')

      // 验证 Authorization header
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-test')

      // 验证 Content-Type 未设置（让 fetch 自动设置 multipart boundary）
      expect(fetchMock.calls[0].opts.headers['Content-Type']).toBeUndefined()
    })

    it('model 默认 whisper-1', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ text: 'Hi' })])
      global.fetch = fetchMock

      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      await adapter.transcribe({ file: fakeFile })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('model')).toBe('whisper-1')
    })

    it('language 可选（未提供时不附加）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ text: 'Hi' })])
      global.fetch = fetchMock

      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      await adapter.transcribe({ file: fakeFile })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('language')).toBeNull()
    })

    it('响应无 language/duration 字段时返回默认值', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ text: 'Only text' })])
      global.fetch = fetchMock

      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      const result = await adapter.transcribe({ file: fakeFile })

      expect(result.text).toBe('Only text')
      expect(result.language).toBeUndefined()
      expect(result.duration).toBeUndefined()
    })

    it('响应无 text 字段返回空字符串', async () => {
      const fetchMock = createFetchMock([createFetchResponse({})])
      global.fetch = fetchMock

      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      const result = await adapter.transcribe({ file: fakeFile })

      expect(result.text).toBe('')
    })

    it('无 file 参数抛错', async () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      await expect(adapter.transcribe({})).rejects.toThrow(/file.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      await expect(adapter.transcribe()).rejects.toThrow(/file.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-bad' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
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
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
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
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（继承自 OpenAIAdapter）', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ data: [{ id: 'gpt-4o' }] }),
      ])
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new OpenAIWhisperAdapter({
        id: 'openai-whisper',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('openai-whisper')
      expect(info.baseUrl).toBe('https://api.openai.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new OpenAIWhisperAdapter({ id: 'openai-whisper', apiKey: 'sk-test' })
      const fakeFile = new Blob(['audio'], { type: 'audio/mp3' })
      try {
        await adapter.transcribe({ file: fakeFile })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })
})
