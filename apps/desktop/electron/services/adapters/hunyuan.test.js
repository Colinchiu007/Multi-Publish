// @ts-check
/**
 * hunyuan.test.js — 腾讯混元视频 Adapter 测试
 *
 * 验证：
 * - 构造与配置（credentials + options 分离）
 * - validateConfig（secretId + secretKey 必填）
 * - 能力协商（supports generateVideo/getVideoStatus）
 * - generateVideo 成功调用（验证 URL、headers、body）
 * - getVideoStatus 成功调用
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection
 * - 网络错误分类（ETIMEDOUT → TIMEOUT, ECONNREFUSED → NETWORK_ERROR）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { HunyuanAdapter } = require('./hunyuan')
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

describe('HunyuanAdapter — 腾讯混元视频', () => {
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
      const adapter = new HunyuanAdapter({
        id: 'hunyuan',
        secretId: 'AKIDxxxx',
        secretKey: 'xxxxSecret',
      }, { timeout: 60000 })
      expect(adapter.id).toBe('hunyuan')
      expect(adapter.credentials.secretId).toBe('AKIDxxxx')
      expect(adapter.credentials.secretKey).toBe('xxxxSecret')
      expect(adapter.options.timeout).toBe(60000)
    })

    it('默认 baseUrl 为腾讯混元端点', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      expect(adapter.credentials.baseUrl).toBe('https://hunyuan.tencentcloudapi.com')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 secretId + secretKey 时返回 valid', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      expect(adapter.validateConfig().valid).toBe(true)
    })

    it('无 secretId 时返回 invalid', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretKey: 'b' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('secretId is required')
    })

    it('无 secretKey 时返回 invalid', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('secretKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus / listModels / testConnection', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Image 方法', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })

    it('capabilities() 返回视频相关方法', () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateVideo')
      expect(caps).toContain('getVideoStatus')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('generateVideo', () => {
    it('POST /，返回 { jobId, model }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ Response: { JobId: 'job-123' } }),
      ])
      global.fetch = fetchMock

      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const result = await adapter.generateVideo({ prompt: '一只猫' })

      expect(result.jobId).toBe('job-123')
      expect(result.model).toBe('hunyuan-video')

      // 验证 URL 与请求体
      expect(fetchMock.calls[0].url).toBe('https://hunyuan.tencentcloudapi.com/')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.Action).toBe('SubmitHunyuanVideoJob')
      expect(body.Text).toBe('一只猫')
      // 验证 Authorization 头存在
      expect(fetchMock.calls[0].opts.headers['Authorization']).toMatch(/TC3-HMAC-SHA256/)
    })

    it('无 prompt 抛错', async () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'Unauthorized' }, 401)])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'Too Many Requests' }, 429)])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'Internal Error' }, 500)])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('查询任务状态返回 { status, videoUrl, progress }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          Response: { Status: 'SUCCESS', VideoUrl: 'https://example.com/v.mp4', Progress: 100 },
        }),
      ])
      global.fetch = fetchMock

      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const result = await adapter.getVideoStatus('job-123')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://example.com/v.mp4')
      expect(result.progress).toBe(100)

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.Action).toBe('DescribeTaskStatus')
      expect(body.JobId).toBe('job-123')
    })

    it('RUNNING 状态映射为 processing', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ Response: { Status: 'RUNNING', Progress: 50 } }),
      ])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const result = await adapter.getVideoStatus('job-1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(50)
    })

    it('无 jobId 抛错', async () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/jobId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('签名通过返回 success: true', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ Response: { Error: { Code: 'InvalidParameter' } } }),
      ])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('签名失败返回 success: false', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ Response: { Error: { Code: 'AuthFailure.SignatureFailure' } } }),
      ])
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('返回静态预定义模型列表', async () => {
      const adapter = new HunyuanAdapter({ id: 'hunyuan', secretId: 'a', secretKey: 'b' })
      const models = await adapter.listModels()
      expect(models.length).toBeGreaterThan(0)
      expect(models[0].id).toBe('hunyuan-video')
    })
  })
})
