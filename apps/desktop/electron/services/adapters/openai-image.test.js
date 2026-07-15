// @ts-check
/**
 * openai-image.test.js — TDD: OpenAI DALL-E Image Adapter 测试
 *
 * 验证：
 * - 构造与配置（继承 OpenAIAdapter）
 * - validateConfig（继承）
 * - 能力协商（supports generateImage/editImage）
 * - generateImage（POST /images/generations，JSON body）
 * - editImage（POST /images/edits，FormData body）
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（继承自 OpenAIAdapter）
 * - getProviderInfo（继承）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { OpenAIImageAdapter } = require('./openai-image')
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

describe('OpenAIImageAdapter — OpenAI DALL-E Image Adapter', () => {
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
      const adapter = new OpenAIImageAdapter({
        id: 'openai-image',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('openai-image')
      expect(adapter.credentials.apiKey).toBe('sk-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 OpenAI 官方端点', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('apiKey 为 null 时返回 invalid', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: null })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage/editImage）', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      expect(adapter.supports('generateImage')).toBe(true)
      expect(adapter.supports('editImage')).toBe(true)
    })

    it('继承支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('streamChat')).toBe(true)
      expect(adapter.supports('embeddings')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 TTS/Video 方法', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('listVoices')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
      expect(adapter.supports('getVideoStatus')).toBe(false)
    })

    it('capabilities() 返回 generateImage 和 editImage', () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('editImage')
      // 继承自 OpenAIAdapter
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
            { url: 'https://example.com/image1.png' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const result = await adapter.generateImage({
        prompt: 'A cat in space',
        model: 'dall-e-3',
        n: 1,
        size: '1024x1024',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://example.com/image1.png')
      expect(result.model).toBe('dall-e-3')
      expect(result.created).toBe(1700000000)

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/images/generations')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-test')

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('dall-e-3')
      expect(body.prompt).toBe('A cat in space')
      expect(body.n).toBe(1)
      expect(body.size).toBe('1024x1024')
    })

    it('model 默认 dall-e-3，size 默认 1024x1024', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('dall-e-3')
      expect(body.size).toBe('1024x1024')
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

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
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

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body).not.toHaveProperty('response_format')
    })

    it('无 prompt 参数抛错', async () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await expect(adapter.generateImage({})).rejects.toThrow(/prompt.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await expect(adapter.generateImage()).rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-bad' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('editImage', () => {
    it('POST /images/edits 返回 { images, model, created }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          created: 1700000000,
          data: [{ url: 'https://example.com/edited.png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['fake image'], { type: 'image/png' })
      const result = await adapter.editImage({
        image: fakeImage,
        prompt: 'Add a hat',
        model: 'dall-e-3',
        n: 1,
        size: '1024x1024',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://example.com/edited.png')
      expect(result.model).toBe('dall-e-3')
      expect(result.created).toBe(1700000000)

      // 验证请求
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('/images/edits')

      // 验证 FormData
      const body = fetchMock.calls[0].opts.body
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('prompt')).toBe('Add a hat')
      expect(body.get('model')).toBe('dall-e-3')
      expect(body.get('n')).toBe('1')
      expect(body.get('size')).toBe('1024x1024')

      // 验证 Authorization header
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer sk-test')

      // 验证 Content-Type 未设置（让 fetch 自动设置 multipart boundary）
      expect(fetchMock.calls[0].opts.headers['Content-Type']).toBeUndefined()
    })

    it('支持 mask 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      const fakeMask = new Blob(['mask'], { type: 'image/png' })
      await adapter.editImage({
        image: fakeImage,
        prompt: 'Edit',
        mask: fakeMask,
      })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('mask')).not.toBeNull()
    })

    it('未提供 mask 时不附加该字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      await adapter.editImage({ image: fakeImage, prompt: 'Edit' })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('mask')).toBeNull()
    })

    it('model 默认 dall-e-3，size 默认 1024x1024', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ created: 0, data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      await adapter.editImage({ image: fakeImage, prompt: 'Edit' })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('model')).toBe('dall-e-3')
      expect(body.get('size')).toBe('1024x1024')
    })

    it('无 image 参数抛错', async () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await expect(adapter.editImage({ prompt: 'Edit' })).rejects.toThrow(/image.*required/i)
    })

    it('无 prompt 参数抛错', async () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      await expect(adapter.editImage({ image: fakeImage })).rejects.toThrow(/prompt.*required/i)
    })

    it('无参数抛错', async () => {
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await expect(adapter.editImage()).rejects.toThrow(/image.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-bad' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      try {
        await adapter.editImage({ image: fakeImage, prompt: 'Edit' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      try {
        await adapter.editImage({ image: fakeImage, prompt: 'Edit' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const fakeImage = new Blob(['image'], { type: 'image/png' })
      try {
        await adapter.editImage({ image: fakeImage, prompt: 'Edit' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new OpenAIImageAdapter({
        id: 'openai-image',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('openai-image')
      expect(info.baseUrl).toBe('https://api.openai.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
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
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('aborted → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })
})
