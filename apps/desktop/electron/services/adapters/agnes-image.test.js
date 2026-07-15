// @ts-check
/**
 * agnes-image.test.js — TDD: Agnes Image Adapter 测试
 *
 * Agnes Image API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - generateImage: POST /images/generations（OpenAI 兼容）
 * - 请求体 { model: 'agnes-image-2.1-flash', prompt, size: '2K', ratio: '16:9', response_format: 'url' }
 * - 响应中 data[0].url 为图片 URL
 * - 支持 size 参数映射：2048x2048 → 2K
 * - listModels: 静态返回 1 个模型
 * - testConnection: 验证 apiKey 存在
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { AgnesImageAdapter, AGNES_IMAGE_MODELS, parseSizeTier } = require('./agnes-image')
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

describe('AgnesImageAdapter — Agnes Image Adapter', () => {
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
      const adapter = new AgnesImageAdapter({
        id: 'agnes-image',
        apiKey: 'agnes-test-key',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('agnes-image')
      expect(adapter.credentials.apiKey).toBe('agnes-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://apihub.agnes-ai.com/v1')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 Agnes 官方端点', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      expect(adapter.credentials.baseUrl).toBe('https://apihub.agnes-ai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法 generateImage', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      expect(adapter.supports('generateImage')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
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
        createFetchResponse({ data: [{ url: 'https://cdn.example.com/img.png' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'a cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer agnes-test')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage', () => {
    it('POST /images/generations 返回图片 URL', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          data: [{ url: 'https://cdn.example.com/cat.png' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      const result = await adapter.generateImage({
        prompt: 'a cat sitting on a chair',
      })

      expect(result.urls).toHaveLength(1)
      expect(result.urls[0]).toBe('https://cdn.example.com/cat.png')
      expect(result.format).toBe('url')

      // 验证 URL 包含 /images/generations
      expect(fetchMock.calls[0].url).toContain('/images/generations')
    })

    it('默认 model 为 agnes-image-2.1-flash', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('agnes-image-2.1-flash')
      expect(body.response_format).toBe('url')
    })

    it('size 2048x2048 → 2K 档位', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'test', size: '2048x2048' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.size).toBe('2K')
    })

    it('size 1024x1024 → 1K 档位', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'test', size: '1024x1024' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.size).toBe('1K')
    })

    it('sizeTier 优先于 size 解析', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({
        prompt: 'test',
        size: '1024x1024',  // 会解析为 1K
        sizeTier: '4K',     // 但 sizeTier 优先
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.size).toBe('4K')
    })

    it('ratio 默认 16:9', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.ratio).toBe('16:9')
    })

    it('自定义 ratio 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{ url: 'x' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.generateImage({ prompt: 'test', ratio: '1:1' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.ratio).toBe('1:1')
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('响应缺少 url → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: [{}] }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      try {
        await adapter.generateImage({ prompt: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-bad' })
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
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 Agnes Image 模型列表（1 个）', async () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('agnes-image-2.1-flash')
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('apiKey 存在时返回 { success: true }', async () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: 'agnes-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('apiKey 缺失时返回 { success: false, error }', async () => {
      const adapter = new AgnesImageAdapter({ id: 'agnes-image', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })
})
