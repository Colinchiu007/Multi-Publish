// @ts-check
/**
 * minimax-image.test.js — TDD: MiniMax Image Adapter 测试
 *
 * MiniMax Image API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - generateImage: POST /image_generation（同步接口）
 * - 请求体 { model, prompt, aspect_ratio, response_format: 'url', n: 1 }
 * - 响应中 data.image_urls 为图片 URL 数组
 * - 支持 size 参数自动解析为 aspect_ratio（1024x1024 → 1:1，1920x1080 → 16:9）
 * - listModels: 静态返回 2 个模型
 * - testConnection: 验证 apiKey 存在
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { MinimaxImageAdapter, MINIMAX_IMAGE_MODELS, parseAspectRatio } = require('./minimax-image')
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

describe('MinimaxImageAdapter — MiniMax Image Adapter', () => {
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
      const adapter = new MinimaxImageAdapter({
        id: 'minimax-image',
        apiKey: 'mm-test-key',
        baseUrl: 'https://api.minimaxi.com/v1',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('minimax-image')
      expect(adapter.credentials.apiKey).toBe('mm-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 MiniMax 官方端点', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法 generateImage', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      expect(adapter.supports('generateImage')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
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
        createFetchResponse({ data: { image_urls: ['https://cdn.example.com/img.png'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({ prompt: 'a cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer mm-test')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage', () => {
    it('POST /image_generation 返回图片 URL', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          data: { image_urls: ['https://cdn.example.com/cat.png'] },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      const result = await adapter.generateImage({
        prompt: 'a cat sitting on a chair',
      })

      expect(result.urls).toHaveLength(1)
      expect(result.urls[0]).toBe('https://cdn.example.com/cat.png')
      expect(result.format).toBe('url')

      // 验证 URL 包含 /image_generation
      expect(fetchMock.calls[0].url).toContain('/image_generation')
    })

    it('默认 model 为 image-01', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { image_urls: ['x'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('image-01')
      expect(body.response_format).toBe('url')
      expect(body.n).toBe(1)
    })

    it('支持自定义 model（image-01-live）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { image_urls: ['x'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({ prompt: 'test', model: 'image-01-live' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('image-01-live')
    })

    it('size 1024x1024 → aspect_ratio 1:1', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { image_urls: ['x'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({ prompt: 'test', size: '1024x1024' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.aspect_ratio).toBe('1:1')
    })

    it('size 1920x1080 → aspect_ratio 16:9', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { image_urls: ['x'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({ prompt: 'test', size: '1920x1080' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.aspect_ratio).toBe('16:9')
    })

    it('aspect_ratio 优先于 size 解析', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { image_urls: ['x'] } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.generateImage({
        prompt: 'test',
        size: '1024x1024',
        aspect_ratio: '9:16',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.aspect_ratio).toBe('9:16')
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ base_resp: { status_msg: 'Invalid API key' } }, 401),
      ])
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-bad' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('网络错误 → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 MiniMax Image 模型列表（2 个）', async () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(2)
      const ids = models.map(m => m.id)
      expect(ids).toContain('image-01')
      expect(ids).toContain('image-01-live')
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('apiKey 存在时返回 { success: true }', async () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: 'mm-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('apiKey 缺失时返回 { success: false, error }', async () => {
      const adapter = new MinimaxImageAdapter({ id: 'minimax-image', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })
})
