// @ts-check
/**
 * grok-video.test.js — xAI Grok Video Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo（同步）、getVideoStatus（固定 completed）、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { GrokVideoAdapter } = require('./grok-video')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { ADAPTER_VERSION } = require('./_base/base')

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

describe('GrokVideoAdapter — xAI Grok Video', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new GrokVideoAdapter({
        id: 'grok', apiKey: 'xai-key', baseUrl: 'https://api.x.ai/v1',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('grok')
      expect(adapter.credentials.apiKey).toBe('xai-key')
      expect(adapter.options.timeout).toBe(120000)
    })
    it('默认 baseUrl', () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://api.x.ai/v1')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo（同步）', () => {
    it('POST /video/generations 返回 { videoUrl, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ url: 'https://x.ai/v/abc.mp4' })])
      global.fetch = fetchMock

      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '猫咪跳舞' })

      expect(result.videoUrl).toBe('https://x.ai/v/abc.mp4')
      expect(result.model).toBe('grok-video')

      expect(fetchMock.calls[0].url).toContain('/video/generations')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('猫咪跳舞')
      expect(body.model).toBe('grok-video')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('无 prompt 抛错', async () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'Bad key' } }, 401)])
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'rate' } }, 429)])
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'srv' } }, 500)])
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus（同步模式）', () => {
    it('固定返回 { status: completed }', async () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      const result = await adapter.getVideoStatus('any')
      expect(result.status).toBe('completed')
      expect(result.progress).toBe(100)
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ url: 'https://x/v.mp4' })])
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
    it('配置无效返回 false', async () => {
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new GrokVideoAdapter({ id: 'grok', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
