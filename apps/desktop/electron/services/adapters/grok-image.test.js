// @ts-check
/**
 * grok-image.test.js — TDD: xAI Grok Image Adapter 测试
 *
 * 验证：
 * - 构造与配置（继承 OpenAICompatibleAdapter，默认 baseUrl = https://api.x.ai/v1）
 * - validateConfig（继承自 OpenAICompatibleAdapter，apiKey 可选）
 * - getProviderInfo 返回正确 id
 * - 能力协商（supports generateImage，继承 LLM 方法）
 * - generateImage（POST /images/generations）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（继承）
 * - 网络错误分类
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { GrokImageAdapter } = require('./grok-image')
const { ProviderError, ERROR_CODES } = require('./provider-error')
const { ADAPTER_VERSION } = require('./base')

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

describe('GrokImageAdapter — xAI Grok Image Adapter', () => {
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
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
        baseUrl: 'https://api.x.ai/v1',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('grok-image')
      expect(adapter.credentials.apiKey).toBe('xai-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.x.ai/v1')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('未传 baseUrl 时默认为 https://api.x.ai/v1', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      expect(adapter.credentials.baseUrl).toBe('https://api.x.ai/v1')
    })

    it('显式传入 baseUrl 时使用传入值', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
        baseUrl: 'https://custom.x.ai/v2',
      })
      expect(adapter.credentials.baseUrl).toBe('https://custom.x.ai/v2')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时仍 valid（继承 OpenAICompatibleAdapter，apiKey 可选）', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('apiKey 为空字符串时仍 valid', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: '',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('grok-image')
      expect(info.baseUrl).toBe('https://api.x.ai/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage）', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      expect(adapter.supports('generateImage')).toBe(true)
    })

    it('继承支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 TTS/Video 方法', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('listVoices')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
      expect(adapter.supports('getVideoStatus')).toBe(false)
    })

    it('capabilities() 包含 generateImage', () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      // 继承自 OpenAICompatibleAdapter
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('generateImage', () => {
    it('POST /images/generations 返回 { images, model, created }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          created: 1700000000,
          data: [
            { url: 'https://example.com/grok-image1.png' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const result = await adapter.generateImage({
        prompt: 'A cat in space',
        model: 'grok-image',
        n: 1,
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://example.com/grok-image1.png')
      expect(result.model).toBe('grok-image')
      expect(result.created).toBe(1700000000)

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/images/generations')
      expect(fetchMock.calls[0].url).toContain('api.x.ai')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer xai-test-key')

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('grok-image')
      expect(body.prompt).toBe('A cat in space')
      expect(body.n).toBe(1)
      // Grok Image 不发送 size 字段
      expect(body).not.toHaveProperty('size')
    })

    it('model 默认 grok-image', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('grok-image')
      expect(body.n).toBe(1)
    })

    it('支持 response_format=b64_json', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          created: 0,
          data: [{ b64_json: 'base64data' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const result = await adapter.generateImage({
        prompt: 'test',
        response_format: 'b64_json',
      })

      expect(result.images[0].b64_json).toBe('base64data')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.response_format).toBe('b64_json')
    })

    it('未提供 response_format 时不附加该字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body).not.toHaveProperty('response_format')
    })

    it('无 prompt 参数抛错', async () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      await expect(adapter.generateImage({})).rejects.toThrow(/prompt.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      await expect(adapter.generateImage()).rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-bad',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
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
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
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
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（继承自 OpenAICompatibleAdapter）', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ data: [{ id: 'grok-image' }] }),
      ])
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-bad',
      })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new GrokImageAdapter({
        id: 'grok-image',
        apiKey: 'xai-test-key',
      })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })
})
