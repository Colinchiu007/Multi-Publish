// @ts-check
/**
 * veo.test.js — Google Veo Video Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo（长运行）、getVideoStatus、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { VeoAdapter } = require('./veo')
const { ProviderError, ERROR_CODES } = require('./provider-error')
const { ADAPTER_VERSION } = require('./base')

function createFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
    body: null,
  }
}

function createFetchMock(responses = []) {
  const calls = []
  const mock = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts })
    return responses.shift() || createFetchResponse({})
  })
  mock.calls = calls
  return mock
}

describe('VeoAdapter — Google Veo', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new VeoAdapter({
        id: 'veo', apiKey: 'google-key', baseUrl: 'https://generativelanguage.googleapis.com',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('veo')
      expect(adapter.credentials.apiKey).toBe('google-key')
    })
    it('默认 baseUrl', () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://generativelanguage.googleapis.com')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo', () => {
    it('POST /v1beta/models/veo:predictLongRunning 返回 { jobId, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ name: 'operations/abc-123' })])
      global.fetch = fetchMock

      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '宇宙星空' })

      expect(result.jobId).toBe('operations/abc-123')
      expect(result.model).toBe('veo')

      expect(fetchMock.calls[0].url).toContain('/v1beta/models/veo:predictLongRunning')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.instances[0].prompt).toBe('宇宙星空')
      expect(body.parameters.sampleCount).toBe(1)
      // API key 通过 header 和 query 双重传递
      expect(fetchMock.calls[0].opts.headers['x-goog-api-key']).toBe('k')
      expect(fetchMock.calls[0].url).toContain('key=k')
    })

    it('无 prompt 抛错', async () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'Bad key' } }, 401)])
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'rate' } }, 429)])
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'srv' } }, 500)])
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /v1beta/{jobId} 返回状态（done=true）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        done: true,
        response: { generatedSamples: [{ video: { uri: 'https://example.com/v.mp4' } }] },
      })])
      global.fetch = fetchMock

      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      const result = await adapter.getVideoStatus('operations/abc-123')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://example.com/v.mp4')
      expect(result.progress).toBe(100)
      expect(fetchMock.calls[0].url).toContain('/v1beta/operations/abc-123')
    })

    it('done=false → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({ done: false })])
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      const result = await adapter.getVideoStatus('op/1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(0)
    })

    it('无 jobId 抛错', async () => {
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/jobId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ name: 'op/1' })])
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new VeoAdapter({ id: 'veo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
