// @ts-check
/**
 * local-diffusion.test.js — 本地 Stable Diffusion Adapter 测试
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { LocalDiffusionAdapter } = require('./local-diffusion')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { BaseAdapter, ADAPTER_VERSION } = require('./_base/base')

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

describe('LocalDiffusionAdapter — 本地 Stable Diffusion Adapter', () => {
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
      const adapter = new LocalDiffusionAdapter({
        id: 'local-sd',
        baseUrl: 'http://localhost:7860',
      }, {
        timeout: 300000,
        maxRetries: 0,
      })
      expect(adapter.id).toBe('local-sd')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:7860')
      expect(adapter.options.timeout).toBe(300000)
    })

    it('默认 baseUrl 为 localhost:7860', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:7860')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd', baseUrl: 'http://localhost:7860' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 baseUrl 时返回 invalid（理论上不会发生，因构造时已填默认）', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      // 构造时已自动填充默认 baseUrl，手动清空测试
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })
  })

  describe('能力协商', () => {
    it('支持 Image 方法（generateImage/editImage/listModels）', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      expect(adapter.supports('generateImage')).toBe(true)
      expect(adapter.supports('editImage')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Video 方法', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法（含 editImage）', () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('editImage')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
      expect(caps).not.toContain('synthesize')
    })
  })

  describe('认证（无需认证）', () => {
    it('请求头不含 Authorization', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['base64data'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'a cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage', () => {
    it('POST /sdapi/v1/txt2img 返回 b64_json', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: ['iVBORw0KGgoAAAANSUhEUg=='],
          parameters: { steps: 20, width: 512, height: 512 },
          info: '{"prompt":"a cat"}',
        }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.generateImage({
        prompt: 'a cat sitting on a chair',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].b64_json).toBe('iVBORw0KGgoAAAANSUhEUg==')
      expect(result.model).toBe('sd')
      expect(result.parameters.steps).toBe(20)

      // 验证 URL
      expect(fetchMock.calls[0].url).toContain('/sdapi/v1/txt2img')

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('a cat sitting on a chair')
      expect(body.steps).toBe(20)
      expect(body.width).toBe(512)
      expect(body.height).toBe(512)
      expect(body.sampler_name).toBe('Euler a')
    })

    it('默认 steps=20', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.steps).toBe(20)
    })

    it('默认 width=512 height=512', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.width).toBe(512)
      expect(body.height).toBe(512)
    })

    it('默认 sampler_name=Euler a', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.sampler_name).toBe('Euler a')
    })

    it('支持 negative_prompt 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'test', negative_prompt: 'blurry, low quality' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.negative_prompt).toBe('blurry, low quality')
    })

    it('支持自定义 steps/width/height/sampler_name', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({
        prompt: 'test',
        steps: 30,
        width: 1024,
        height: 768,
        sampler_name: 'DPM++ 2M Karras',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.steps).toBe(30)
      expect(body.width).toBe(1024)
      expect(body.height).toBe(768)
      expect(body.sampler_name).toBe('DPM++ 2M Karras')
    })

    it('支持 seed 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'test', seed: 42 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.seed).toBe(42)
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('无参数（undefined）抛错误', async () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await expect(adapter.generateImage())
        .rejects.toThrow(/prompt.*required/i)
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'CUDA out of memory' }, 500),
      ])
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Too many requests' }, 429),
      ])
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      try {
        await adapter.generateImage({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('响应无 images 字段 → 返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ parameters: {} }),
      ])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.generateImage({ prompt: 't' })
      expect(result.images).toEqual([])
    })

    it('响应无 parameters 字段 → 返回空对象', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'] }),
      ])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.generateImage({ prompt: 't' })
      expect(result.parameters).toEqual({})
    })

    it('多张图片（batch）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: ['img1_b64', 'img2_b64', 'img3_b64'],
          parameters: {},
        }),
      ])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.generateImage({ prompt: 't', batch_size: 3 })
      expect(result.images).toHaveLength(3)
      expect(result.images[0].b64_json).toBe('img1_b64')
      expect(result.images[2].b64_json).toBe('img3_b64')
    })
  })

  describe('editImage', () => {
    it('POST /sdapi/v1/img2img 编辑图像', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          images: ['edited_b64'],
          parameters: { denoising_strength: 0.75 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.editImage({
        image: 'original_b64_data',
        prompt: 'make it more colorful',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].b64_json).toBe('edited_b64')
      expect(result.model).toBe('sd')

      // 验证 URL
      expect(fetchMock.calls[0].url).toContain('/sdapi/v1/img2img')

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.init_images).toEqual(['original_b64_data'])
      expect(body.prompt).toBe('make it more colorful')
      expect(body.denoising_strength).toBe(0.75)
    })

    it('默认 denoising_strength=0.75', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.editImage({ image: 'b64', prompt: 'test' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.denoising_strength).toBe(0.75)
    })

    it('支持自定义 denoising_strength', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.editImage({ image: 'b64', prompt: 'test', denoising_strength: 0.5 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.denoising_strength).toBe(0.5)
    })

    it('无 image 参数抛错误', async () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await expect(adapter.editImage({ prompt: 'test' }))
        .rejects.toThrow(/image.*required/i)
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await expect(adapter.editImage({ image: 'b64' }))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      try {
        await adapter.editImage({ image: 'b64', prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('GET /sdapi/v1/sd-models 返回模型列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([
          { model_name: 'v1-5-pruned', title: 'v1-5-pruned [cc6cb27103]', sha256: 'abc123' },
          { model_name: 'sd-xl-base', title: 'sd_xl_base_1.0 [xyz789]' },
        ]),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const models = await adapter.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('v1-5-pruned')
      expect(models[0].name).toBe('v1-5-pruned [cc6cb27103]')
    })

    it('响应非数组 → 返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ error: 'not array' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })

    it('响应空数组 → 返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([]),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（GET /sdapi/v1/options）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ sd_model_checkpoint: 'v1-5-pruned' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      expect(fetchMock.calls[0].url).toContain('/sdapi/v1/options')
      expect(fetchMock.calls[0].opts.method).toBe('GET')
    })

    it('服务未启动（ECONNREFUSED）→ { success: false, error: NETWORK_ERROR }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })

    it('500 错误 → { success: false, error: PROVIDER_ERROR }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('超时 → { success: false, error: TIMEOUT }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.TIMEOUT)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ images: ['x'], parameters: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalDiffusionAdapter({
        id: 'local-sd-custom',
        baseUrl: 'http://192.168.1.100:7860',
      })
      await adapter.generateImage({ prompt: 'test' })

      expect(fetchMock.calls[0].url).toContain('192.168.1.100')
      expect(fetchMock.calls[0].url).not.toContain('localhost')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
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
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
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
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
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
      const adapter = new LocalDiffusionAdapter({
        id: 'local-sd',
        baseUrl: 'http://localhost:7860',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('local-sd')
      expect(info.baseUrl).toBe('http://localhost:7860')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
