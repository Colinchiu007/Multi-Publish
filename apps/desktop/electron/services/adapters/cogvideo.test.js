// @ts-check
/**
 * cogvideo.test.js — 智谱 CogVideo Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo、getVideoStatus、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { CogVideoAdapter } = require('./cogvideo')
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

describe('CogVideoAdapter — 智谱 CogVideo', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new CogVideoAdapter({
        id: 'cogvideo', apiKey: 'cg-key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      }, { timeout: 60000 })
      expect(adapter.id).toBe('cogvideo')
      expect(adapter.credentials.apiKey).toBe('cg-key')
      expect(adapter.options.timeout).toBe(60000)
    })

    it('默认 baseUrl', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus / listModels / testConnection', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
    it('不支持 LLM/TTS/Image', () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })
  })

  describe('generateVideo', () => {
    it('POST /videos/generations 返回 { taskId, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ id: 'task-abc' })])
      global.fetch = fetchMock

      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '日落' })

      expect(result.taskId).toBe('task-abc')
      expect(result.model).toBe('cogvideo')

      expect(fetchMock.calls[0].url).toContain('/videos/generations')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('日落')
      expect(body.model).toBe('cogvideo')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('无 prompt 抛错', async () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 错误 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'Bad key' } }, 401)])
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 错误 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'rate' } }, 429)])
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })

    it('500 错误 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'srv' } }, 500)])
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /async-result/{taskId} 返回 { status, videoUrl, progress }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        task_status: 'SUCCESS',
        video_result: [{ url: 'https://example.com/v.mp4' }],
        progress: 100,
      })])
      global.fetch = fetchMock

      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      const result = await adapter.getVideoStatus('task-abc')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://example.com/v.mp4')
      expect(result.progress).toBe(100)
      expect(fetchMock.calls[0].url).toContain('/async-result/task-abc')
    })

    it('无 taskId 抛错', async () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('配置无效时返回 false', async () => {
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ id: 't' })])
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new CogVideoAdapter({ id: 'cogvideo', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
