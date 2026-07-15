// @ts-check
/**
 * flux.test.js — P3.8 TDD: BFL FLUX Image Adapter 测试
 *
 * 验证 IImageAdapter mixin 的扩展性 — 第一个 Image 类别的 Adapter。
 *
 * BFL FLUX API 关键特性：
 * - 认证头 Bearer + key（回退 OpenAI 模式）
 * - generateImage: POST /v1/flux-pro-1.1 返回 { images: [{ url }] } 或 polling 任务
 * - listModels: 通过静态预定义列表（无 /models 端点，返回 FLUX 系列模型）
 * - testConnection: 通过最小图片请求验证（prompt: "test", num_images: 1）
 * - 不支持 LLM/TTS/Video 方法
 * - generateImage 返回 { images: [{ url, b64? }], model, seed? }
 * - 支持尺寸预设：square_hd/square/portrait_4_3/landscape_4_3 等
 * - 支持安全模式 safety_tolerance（0-6，0 最严格）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { FluxAdapter } = require('./flux')
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

describe('FluxAdapter — P3.8 第一个 Image Adapter', () => {
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
      const adapter = new FluxAdapter({
        id: 'flux',
        apiKey: 'flux-test-key',
        baseUrl: 'https://api.bfl.ai',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('flux')
      expect(adapter.credentials.apiKey).toBe('flux-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.bfl.ai')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 BFL 官方端点', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.bfl.ai')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage/listModels）', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      expect(adapter.supports('generateImage')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
      expect(caps).not.toContain('synthesize')
    })
  })

  describe('认证头（Bearer 模式）', () => {
    it('请求头使用 Authorization Bearer', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: [{ url: 'https://cdn.example.com/img.png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({
        prompt: 'a cat',
      })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer flux-test')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage', () => {
    it('POST /v1/flux-pro-1.1 返回图片 URL', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: [{ url: 'https://cdn.example.com/cat.png' }],
          model: 'flux-pro-1.1',
          seed: 12345,
        }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const result = await adapter.generateImage({
        prompt: 'a cat sitting on a chair',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://cdn.example.com/cat.png')
      expect(result.model).toBe('flux-pro-1.1')
      expect(result.seed).toBe(12345)

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('a cat sitting on a chair')
    })

    it('默认 model 为 flux-pro-1.1', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('flux-pro-1.1')
    })

    it('支持自定义 model（flux-dev/flux-schnell）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({
        prompt: 'test',
        model: 'flux-schnell',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('flux-schnell')
    })

    it('支持 width/height 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({
        prompt: 'test',
        width: 1024,
        height: 768,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBe(1024)
      expect(body.height).toBe(768)
    })

    it('支持 image_size 预设（自动展开为 width/height）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({
        prompt: 'test',
        image_size: 'square_hd',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBeDefined()
      expect(body.height).toBeDefined()
    })

    it('支持 num_images 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'a' }, { url: 'b' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const result = await adapter.generateImage({
        prompt: 'test',
        num_images: 2,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.num_images).toBe(2)
      expect(result.images).toHaveLength(2)
    })

    it('支持 safety_tolerance 参数（0-6）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({
        prompt: 'test',
        safety_tolerance: 2,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.safety_tolerance).toBe(2)
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Invalid API key' }, 401),
      ])
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-bad' })
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
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
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
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 FLUX 模型列表', async () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const models = await adapter.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)
      // 至少包含 flux-pro-1.1
      const ids = models.map(m => m.id || m.model_id)
      expect(ids).toContain('flux-pro-1.1')
    })

    it('返回的模型包含 id 和 name 字段', async () => {
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const models = await adapter.listModels()
      for (const m of models) {
        expect(m.id || m.model_id).toBeDefined()
        expect(m.name).toBeDefined()
      }
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（通过最小图片请求验证）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: [{ url: 'https://cdn.example.com/test.png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      // 验证发送了最小请求
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBeDefined()
      expect(body.num_images).toBe(1)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Bad key' }, 401),
      ])
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new FluxAdapter({
        id: 'flux-proxy',
        apiKey: 'flux-test',
        baseUrl: 'https://my-proxy.com/bfl',
      })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('api.bfl.ai')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
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
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new FluxAdapter({
        id: 'flux',
        apiKey: 'flux-test',
        baseUrl: 'https://api.bfl.ai',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('flux')
      expect(info.baseUrl).toBe('https://api.bfl.ai')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('image_size 预设映射', () => {
    it('square_hd → 768x768', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 't', image_size: 'square_hd' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBe(768)
      expect(body.height).toBe(768)
    })

    it('portrait_4_3 → 768x1024', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 't', image_size: 'portrait_4_3' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBe(768)
      expect(body.height).toBe(1024)
    })

    it('landscape_16_9 → 1280x720', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 't', image_size: 'landscape_16_9' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBe(1280)
      expect(body.height).toBe(720)
    })

    it('未知 image_size 不抛错（跳过 width/height）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 't', image_size: 'unknown' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBeUndefined()
      expect(body.height).toBeUndefined()
    })
  })
})
