// @ts-check
/**
 * imagen.test.js — Google Imagen Image Adapter 测试
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { ImagenAdapter, IMAGEN_MODELS } = require('./imagen')
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

describe('ImagenAdapter — Google Imagen Image Adapter', () => {
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
      const adapter = new ImagenAdapter({
        id: 'imagen',
        apiKey: 'google-test-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('imagen')
      expect(adapter.credentials.apiKey).toBe('google-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://generativelanguage.googleapis.com')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 Google 官方端点', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      expect(adapter.credentials.baseUrl).toBe('https://generativelanguage.googleapis.com')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage/listModels）', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      expect(adapter.supports('generateImage')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
      expect(caps).not.toContain('synthesize')
    })
  })

  describe('认证（API Key query param 模式）', () => {
    it('请求 URL 包含 ?key=xxx', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          predictions: [{ bytesBase64Encoded: 'base64data', mimeType: 'image/png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test-key' })
      await adapter.generateImage({ prompt: 'a cat' })

      const url = fetchMock.calls[0].url
      expect(url).toContain('key=google-test-key')
    })

    it('请求头不含 Authorization（使用 query param 认证）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          predictions: [{ bytesBase64Encoded: 'base64data', mimeType: 'image/png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      await adapter.generateImage({ prompt: 'a cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage', () => {
    it('POST /v1beta/models/imagen-3:predict 返回 b64_json', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          predictions: [{ bytesBase64Encoded: 'base64data', mimeType: 'image/png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.generateImage({
        prompt: 'a cat sitting on a chair',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].b64_json).toBe('base64data')
      expect(result.images[0].mimeType).toBe('image/png')
      expect(result.model).toBe('imagen-3')

      // 验证 URL
      expect(fetchMock.calls[0].url).toContain('/v1beta/models/imagen-3:predict')

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.instances[0].prompt).toBe('a cat sitting on a chair')
      expect(body.parameters.sampleCount).toBe(1)
    })

    it('默认 model 为 imagen-3', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ predictions: [{ bytesBase64Encoded: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('imagen-3:predict')
    })

    it('支持 sampleCount 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          predictions: [
            { bytesBase64Encoded: 'a', mimeType: 'image/png' },
            { bytesBase64Encoded: 'b', mimeType: 'image/png' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.generateImage({
        prompt: 'test',
        sampleCount: 2,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.parameters.sampleCount).toBe(2)
      expect(result.images).toHaveLength(2)
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('无参数（undefined）抛错误', async () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      await expect(adapter.generateImage())
        .rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-bad' })
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
        createFetchResponse({ error: { message: 'Rate limited' } }, 429),
      ])
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
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
        createFetchResponse({ error: { message: 'Internal error' } }, 500),
      ])
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('响应无 predictions 字段 → 返回空 images', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({}),
      ])
      global.fetch = fetchMock
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.generateImage({ prompt: 't' })
      expect(result.images).toEqual([])
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 Imagen 模型列表', async () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const models = await adapter.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)
      const ids = models.map(m => m.id || m.model_id)
      expect(ids).toContain('imagen-3')
    })

    it('返回的模型包含 id 和 name 字段', async () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const models = await adapter.listModels()
      for (const m of models) {
        expect(m.id || m.model_id).toBeDefined()
        expect(m.name).toBeDefined()
      }
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })

    it('返回的列表是副本，修改不影响下次返回', async () => {
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const list1 = await adapter.listModels()
      list1.push({ id: 'injected', name: 'malicious' })
      list1[0].id = 'tampered'

      const list2 = await adapter.listModels()
      const ids = list2.map(m => m.id)
      expect(ids).toContain('imagen-3')
      expect(ids).not.toContain('injected')
      expect(ids).not.toContain('tampered')
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          predictions: [{ bytesBase64Encoded: 'x', mimeType: 'image/png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.instances[0].prompt).toBeDefined()
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('500 错误 → { success: false, error: PROVIDER_ERROR }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('网络错误 → { success: false, error: NETWORK_ERROR }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ predictions: [{ bytesBase64Encoded: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new ImagenAdapter({
        id: 'imagen-proxy',
        apiKey: 'google-test',
        baseUrl: 'https://my-proxy.com/google',
      })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('generativelanguage.googleapis.com')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
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
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
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
      const adapter = new ImagenAdapter({ id: 'imagen', apiKey: 'google-test' })
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
      const adapter = new ImagenAdapter({
        id: 'imagen',
        apiKey: 'google-test',
        baseUrl: 'https://generativelanguage.googleapis.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('imagen')
      expect(info.baseUrl).toBe('https://generativelanguage.googleapis.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
