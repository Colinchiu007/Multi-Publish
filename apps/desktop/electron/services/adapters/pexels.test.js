// @ts-check
/**
 * pexels.test.js — Pexels 图片搜索 Adapter 测试
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { PexelsAdapter, PEXELS_MODELS } = require('./pexels')
const { ProviderError, ERROR_CODES } = require('./provider-error')
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

describe('PexelsAdapter — Pexels 图片搜索 Adapter', () => {
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
      const adapter = new PexelsAdapter({
        id: 'pexels',
        apiKey: 'pexels-test-key',
        baseUrl: 'https://api.pexels.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('pexels')
      expect(adapter.credentials.apiKey).toBe('pexels-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.pexels.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 Pexels 官方端点', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.pexels.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage/listModels）', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      expect(adapter.supports('generateImage')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
      expect(caps).not.toContain('synthesize')
    })
  })

  describe('认证（Authorization header 模式）', () => {
    it('请求头使用 Authorization 直接放 apiKey（非 Bearer）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 1, photos: [{ src: { large: 'https://x.com/img.jpg' } }] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test-key' })
      await adapter.generateImage({ prompt: 'cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('pexels-test-key')
      // 非 Bearer 前缀
      expect(headers['Authorization']).not.toMatch(/^Bearer /)
    })

    it('使用 GET 方法（无 body）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 1, photos: [{ src: { large: 'https://x.com/img.jpg' } }] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.generateImage({ prompt: 'cat' })

      expect(fetchMock.calls[0].opts.method).toBe('GET')
      expect(fetchMock.calls[0].opts.body).toBeUndefined()
    })
  })

  describe('generateImage（搜索）', () => {
    it('GET /search?query=keyword 返回搜索结果', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          total_results: 100,
          photos: [
            { src: { large: 'https://images.pexels.com/photos/1.jpg', original: 'https://images.pexels.com/photos/1_orig.jpg' }, alt: 'a cute cat', photographer: 'John Doe' },
            { src: { large: 'https://images.pexels.com/photos/2.jpg', original: 'https://images.pexels.com/photos/2_orig.jpg' }, alt: 'a sleeping cat', photographer: 'Jane Smith' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.generateImage({
        prompt: 'cat',
      })

      expect(result.images).toHaveLength(2)
      expect(result.images[0].url).toBe('https://images.pexels.com/photos/1.jpg')
      expect(result.images[0].alt).toBe('a cute cat')
      expect(result.images[0].photographer).toBe('John Doe')
      expect(result.total).toBe(100)
      expect(result.model).toBe('pexels-search')

      // 验证 URL 包含搜索关键词
      const url = fetchMock.calls[0].url
      expect(url).toContain('/search')
      expect(url).toContain('query=cat')
      expect(url).toContain('per_page=3')
    })

    it('默认 per_page=3', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0, photos: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('per_page=3')
    })

    it('支持自定义 per_page', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0, photos: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.generateImage({ prompt: 'test', per_page: 10 })

      expect(fetchMock.calls[0].url).toContain('per_page=10')
    })

    it('prompt 作为搜索关键词 query', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0, photos: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.generateImage({ prompt: 'sunset over mountains' })

      // 关键词被 URL 编码
      const url = fetchMock.calls[0].url
      expect(url).toContain('query=')
      expect(url).toContain('sunset')
      expect(url).toContain('mountains')
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('无参数（undefined）抛错误', async () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await expect(adapter.generateImage())
        .rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Invalid API key' }, 401),
      ])
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-bad' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Rate limited' }, 429),
      ])
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal error' }, 500),
      ])
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('响应无 photos 字段 → 返回空 images', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0 }),
      ])
      global.fetch = fetchMock
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.generateImage({ prompt: 't' })
      expect(result.images).toEqual([])
      expect(result.total).toBe(0)
    })

    it('响应无 total_results 字段 → total 为 0', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ photos: [] }),
      ])
      global.fetch = fetchMock
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.generateImage({ prompt: 't' })
      expect(result.total).toBe(0)
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 Pexels 模型列表', async () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const models = await adapter.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)
      const ids = models.map(m => m.id || m.model_id)
      expect(ids).toContain('pexels-search')
    })

    it('返回的模型包含 id 和 name 字段', async () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const models = await adapter.listModels()
      for (const m of models) {
        expect(m.id || m.model_id).toBeDefined()
        expect(m.name).toBeDefined()
      }
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })

    it('返回的列表是副本，修改不影响下次返回', async () => {
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const list1 = await adapter.listModels()
      list1.push({ id: 'injected', name: 'malicious' })
      list1[0].id = 'tampered'

      const list2 = await adapter.listModels()
      const ids = list2.map(m => m.id)
      expect(ids).toContain('pexels-search')
      expect(ids).not.toContain('injected')
      expect(ids).not.toContain('tampered')
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0, photos: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      // 验证发送了 query=test
      expect(fetchMock.calls[0].url).toContain('query=test')
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Bad key' }, 401),
      ])
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('500 错误 → { success: false, error: PROVIDER_ERROR }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('网络错误 → { success: false, error: NETWORK_ERROR }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ total_results: 0, photos: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new PexelsAdapter({
        id: 'pexels-proxy',
        apiKey: 'pexels-test',
        baseUrl: 'https://my-proxy.com/pexels/v1',
      })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('api.pexels.com')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
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
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('错误响应边界', () => {
    it('非 JSON 错误响应（纯文本）→ ProviderError', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway text' },
      }))
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      try {
        await adapter.generateImage({ prompt: 't' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('Bad Gateway text')
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new PexelsAdapter({
        id: 'pexels',
        apiKey: 'pexels-test',
        baseUrl: 'https://api.pexels.com/v1',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('pexels')
      expect(info.baseUrl).toBe('https://api.pexels.com/v1')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
