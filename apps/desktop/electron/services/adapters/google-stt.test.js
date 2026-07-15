// @ts-check
/**
 * google-stt.test.js — Google Speech-to-Text Adapter 测试
 *
 * Google STT API 关键特性：
 * - 认证：API Key 作为 query param ?key=xxx（非 Bearer / 非 Header）
 * - transcribe: POST /v1/speech:recognize，请求体含 config + audio.content（Base64）
 * - 返回 { results: [{ alternatives: [{ transcript, confidence }] }] }
 * - testConnection: 通过最小 recognize 请求验证 API Key
 *
 * 验证维度：
 * - 构造与配置（默认 baseUrl、版本号）
 * - validateConfig（apiKey 必填）
 * - capabilities 包含 'transcribe'（手动添加，非 KNOWN_METHODS）
 * - transcribe 成功调用（验证 URL 含 ?key=xxx、headers 无 Authorization、body 结构）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（成功/认证失败）
 * - 网络错误分类（TIMEOUT / NETWORK_ERROR）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { GoogleSttAdapter } = require('./google-stt')
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

describe('GoogleSttAdapter — Google Speech-to-Text', () => {
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
      const adapter = new GoogleSttAdapter({
        id: 'google-stt',
        apiKey: 'g-test-key',
        baseUrl: 'https://speech.googleapis.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('google-stt')
      expect(adapter.credentials.apiKey).toBe('g-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://speech.googleapis.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 Google 官方端点', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      expect(adapter.credentials.baseUrl).toBe('https://speech.googleapis.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 testConnection', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Image/Video 方法', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 包含 transcribe（手动添加，非 KNOWN_METHODS）', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('transcribe')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })

    it('supports("transcribe") 因不在 KNOWN_METHODS 中返回 false', () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      // supports() 只对 KNOWN_METHODS 返回 true，transcribe 通过 capabilities() 手动添加
      expect(adapter.supports('transcribe')).toBe(false)
    })
  })

  describe('认证方式（关键差异：?key=xxx query param）', () => {
    it('请求 URL 包含 ?key=xxx', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-secret-key' })
      await adapter.transcribe({ audio: 'base64data' })

      expect(fetchMock.calls[0].url).toContain('key=g-secret-key')
      expect(fetchMock.calls[0].url).toContain('/speech:recognize')
    })

    it('请求头不包含 Authorization', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      await adapter.transcribe({ audio: 'base64data' })

      expect(fetchMock.calls[0].opts.headers['Authorization']).toBeUndefined()
      expect(fetchMock.calls[0].opts.headers['Content-Type']).toBe('application/json')
    })
  })

  describe('transcribe', () => {
    it('POST /speech:recognize 返回识别结果', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          results: [{
            alternatives: [
              { transcript: 'hello world', confidence: 0.95 },
              { transcript: 'hello word', confidence: 0.05 },
            ],
          }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = await adapter.transcribe({ audio: 'base64data' })

      expect(result.text).toBe('hello world')
      expect(result.language).toBe('en-US')
      expect(result.confidence).toBe(0.95)
      expect(result.alternatives).toHaveLength(2)
      expect(result.alternatives[0].text).toBe('hello world')

      expect(fetchMock.calls[0].url).toContain('/speech:recognize')
    })

    it('请求体含 config + audio.content', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      await adapter.transcribe({ audio: 'base64abc' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.config).toBeDefined()
      expect(body.config.languageCode).toBe('en-US')
      expect(body.config.encoding).toBe('LINEAR16')
      expect(body.config.sampleRateHertz).toBe(16000)
      expect(body.audio).toBeDefined()
      expect(body.audio.content).toBe('base64abc')
    })

    it('支持 language 参数覆盖默认 en-US', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = await adapter.transcribe({ audio: 'data', language: 'zh-CN' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.config.languageCode).toBe('zh-CN')
      expect(result.language).toBe('zh-CN')
    })

    it('支持 sampleRateHertz 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      await adapter.transcribe({ audio: 'data', sampleRateHertz: 8000 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.config.sampleRateHertz).toBe(8000)
    })

    it('无 audio 参数抛 INVALID_CONFIG', async () => {
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      await expect(adapter.transcribe({})).rejects.toThrow(/audio.*required/i)
      try {
        await adapter.transcribe({})
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG)
      }
    })

    it('空 results 返回空 text + confidence 0', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = await adapter.transcribe({ audio: 'data' })

      expect(result.text).toBe('')
      expect(result.confidence).toBe(0)
      expect(result.alternatives).toEqual([])
    })
  })

  describe('错误处理', () => {
    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'API key not valid' } }, 401),
      ])
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-bad' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
        expect(e.message).toContain('API key not valid')
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Quota exceeded' } }, 429),
      ])
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
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
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('非 JSON 错误响应 → ProviderError', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway' },
      }))
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('401 认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('400 业务错误（认证通过）视为 success: true', async () => {
      // 空音频触发 400 invalid argument，但说明认证通过
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid audio content' } }, 400),
      ])
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('ECONNREFUSED → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('ENOTFOUND → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ENOTFOUND speech.googleapis.com') })
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new GoogleSttAdapter({ id: 'google-stt', apiKey: 'g-test' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ results: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleSttAdapter({
        id: 'google-stt-proxy',
        apiKey: 'g-test',
        baseUrl: 'https://my-proxy.com/google/v1',
      })
      await adapter.transcribe({ audio: 'data' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('speech.googleapis.com')
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new GoogleSttAdapter({
        id: 'google-stt',
        apiKey: 'g-test',
        baseUrl: 'https://speech.googleapis.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('google-stt')
      expect(info.baseUrl).toBe('https://speech.googleapis.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
