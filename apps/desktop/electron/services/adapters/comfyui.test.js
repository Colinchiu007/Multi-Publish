// @ts-check
/**
 * comfyui.test.js — ComfyUI Adapter 测试
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { ComfyUiAdapter } = require('./comfyui')
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

describe('ComfyUiAdapter — ComfyUI Adapter', () => {
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
      const adapter = new ComfyUiAdapter({
        id: 'comfyui',
        baseUrl: 'http://localhost:8188',
      }, {
        timeout: 60000,
        maxRetries: 0,
        clientId: 'test-client',
      })
      expect(adapter.id).toBe('comfyui')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8188')
      expect(adapter.options.timeout).toBe(60000)
      expect(adapter.options.clientId).toBe('test-client')
    })

    it('默认 baseUrl 为 localhost:8188', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8188')
    })

    it('默认 clientId 为 multi-publish', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.options.clientId).toBe('multi-publish')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui', baseUrl: 'http://localhost:8188' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 baseUrl 时返回 invalid', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })
  })

  describe('能力协商', () => {
    it('支持 generateImage 方法', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.supports('generateImage')).toBe(true)
    })

    it('支持 getVideoStatus（复用为 getJobStatus）', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.supports('getVideoStatus')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/generateVideo 方法', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 Image 相关方法', () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateImage')
      expect(caps).toContain('getVideoStatus')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
      expect(caps).not.toContain('synthesize')
      expect(caps).not.toContain('generateVideo')
    })
  })

  describe('认证（无需认证）', () => {
    it('请求头不含 Authorization', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ prompt_id: 'p1', number: 1, node_errors: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await adapter.generateImage({
        prompt: { '3': { class_type: 'KSampler', inputs: {} } },
      })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('generateImage（异步提交）', () => {
    it('POST /prompt 返回 prompt_id 和 "queued" 消息', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          prompt_id: 'abc-123-def',
          number: 1,
          node_errors: {},
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const workflow = {
        '3': { class_type: 'KSampler', inputs: { seed: 42, cfg: 8 } },
        '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'v1-5-pruned.ckpt' } },
      }
      const result = await adapter.generateImage({
        prompt: workflow,
      })

      expect(result.prompt_id).toBe('abc-123-def')
      expect(result.message).toBe('queued')
      expect(result.model).toBe('comfyui')

      // 验证 URL
      expect(fetchMock.calls[0].url).toContain('/prompt')

      // 验证请求体
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toEqual(workflow)
      expect(body.client_id).toBe('multi-publish')
    })

    it('使用自定义 client_id', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ prompt_id: 'p1' }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await adapter.generateImage({
        prompt: { '3': {} },
        client_id: 'custom-client',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.client_id).toBe('custom-client')
    })

    it('使用 options.clientId 作为默认值', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ prompt_id: 'p1' }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' }, { clientId: 'opts-client' })
      await adapter.generateImage({
        prompt: { '3': {} },
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.client_id).toBe('opts-client')
    })

    it('无 prompt 参数抛错误', async () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await expect(adapter.generateImage({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('无参数（undefined）抛错误', async () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await expect(adapter.generateImage())
        .rejects.toThrow(/prompt.*required/i)
    })

    it('400 错误（工作流无效）→ ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Invalid workflow' }, 400),
      ])
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.generateImage({ prompt: { invalid: 'workflow' } })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal error' }, 500),
      ])
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.generateImage({ prompt: { '3': {} } })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('响应无 prompt_id 字段 → prompt_id 为 undefined', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ number: 1, node_errors: {} }),
      ])
      global.fetch = fetchMock
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.generateImage({ prompt: { '3': {} } })
      expect(result.prompt_id).toBeUndefined()
      expect(result.message).toBe('queued')
    })
  })

  describe('getVideoStatus（复用为 getJobStatus）', () => {
    it('GET /history/{id} 返回任务状态（已完成）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          'abc-123': {
            status: { status_str: 'success', completed: true, messages: [] },
            outputs: {
              '9': { images: [{ filename: 'output.png', subfolder: '', type: 'output' }] },
            },
          },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.getVideoStatus('abc-123')

      expect(result.status).toBe('success')
      expect(result.completed).toBe(true)
      expect(result.prompt_id).toBe('abc-123')
      expect(result.outputs).toBeDefined()
      expect(fetchMock.calls[0].url).toContain('/history/abc-123')
    })

    it('任务不存在（响应空对象）→ status="pending"', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({}),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.getVideoStatus('not-exist-id')
      expect(result.status).toBe('pending')
      expect(result.prompt_id).toBe('not-exist-id')
    })

    it('无 promptId 抛错误', async () => {
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await expect(adapter.getVideoStatus())
        .rejects.toThrow(/promptId.*required/i)
    })

    it('promptId 被编码到 URL（含特殊字符）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({}),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      await adapter.getVideoStatus('abc 123/def')

      // URL 应该包含编码后的 promptId
      expect(fetchMock.calls[0].url).toContain('/history/')
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.getVideoStatus('abc-123')
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('GET /object_info 返回 checkpoint 列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          CheckpointLoaderSimple: {
            input: {
              required: {
                ckpt_name: [
                  ['v1-5-pruned.ckpt', 'sd_xl_base_1.0.safetensors', 'dreamshaper.safetensors'],
                ],
              },
            },
          },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const models = await adapter.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models).toHaveLength(3)
      expect(models[0].id).toBe('v1-5-pruned.ckpt')
      expect(models[1].name).toBe('sd_xl_base_1.0.safetensors')
    })

    it('响应无 CheckpointLoaderSimple → 返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({}),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })

    it('响应中 ckpt_name 为空数组 → 返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          CheckpointLoaderSimple: {
            input: { required: { ckpt_name: [[]] } },
          },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（GET /system_stats）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          system: { os: 'nt', python_version: '3.10' },
          devices: [{ name: 'cuda', type: 'gpu' }],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      expect(fetchMock.calls[0].url).toContain('/system_stats')
      expect(fetchMock.calls[0].opts.method).toBe('GET')
    })

    it('服务未启动（ECONNREFUSED）→ { success: false, error: NETWORK_ERROR }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })

    it('500 错误 → { success: false, error: PROVIDER_ERROR }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal' }, 500),
      ])
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('超时 → { success: false, error: TIMEOUT }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.TIMEOUT)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ prompt_id: 'p1' }),
      ])
      global.fetch = fetchMock

      const adapter = new ComfyUiAdapter({
        id: 'comfyui-remote',
        baseUrl: 'http://192.168.1.100:8188',
      })
      await adapter.generateImage({ prompt: { '3': {} } })

      expect(fetchMock.calls[0].url).toContain('192.168.1.100')
      expect(fetchMock.calls[0].url).not.toContain('localhost')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.generateImage({ prompt: { '3': {} } })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.generateImage({ prompt: { '3': {} } })
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
      const adapter = new ComfyUiAdapter({ id: 'comfyui' })
      try {
        await adapter.generateImage({ prompt: { '3': {} } })
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
      const adapter = new ComfyUiAdapter({
        id: 'comfyui',
        baseUrl: 'http://localhost:8188',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('comfyui')
      expect(info.baseUrl).toBe('http://localhost:8188')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
