// @ts-check
/**
 * runway.test.js — Runway Video Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo（图生视频）、getVideoStatus、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { RunwayAdapter } = require('./runway')
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

describe('RunwayAdapter — Runway', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new RunwayAdapter({
        id: 'runway', apiKey: 'rw-key', baseUrl: 'https://api.runwayml.com/v1',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('runway')
      expect(adapter.credentials.apiKey).toBe('rw-key')
    })
    it('默认 baseUrl', () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://api.runwayml.com/v1')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo（图生视频）', () => {
    it('POST /image_to_video 返回 { taskId, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ id: 'task-001' })])
      global.fetch = fetchMock

      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      const result = await adapter.generateVideo({
        promptImage: 'https://example.com/img.png',
        promptText: 'dance',
      })

      expect(result.taskId).toBe('task-001')
      expect(result.model).toBe('gen3-alpha')

      expect(fetchMock.calls[0].url).toContain('/image_to_video')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.promptImage).toBe('https://example.com/img.png')
      expect(body.promptText).toBe('dance')
      expect(body.model).toBe('gen3-alpha')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('无 promptImage 抛错', async () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      await expect(adapter.generateVideo({ promptText: 'x' })).rejects.toThrow(/promptImage.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'Bad key' }, 401)])
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ promptImage: 'https://x/i.png' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'rate' }, 429)])
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      try {
        await adapter.generateVideo({ promptImage: 'https://x/i.png' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'srv' }, 500)])
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      try {
        await adapter.generateVideo({ promptImage: 'https://x/i.png' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /tasks/{taskId} 返回状态', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        status: 'SUCCEEDED',
        output: ['https://example.com/v.mp4'],
        progress: 100,
      })])
      global.fetch = fetchMock

      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      const result = await adapter.getVideoStatus('task-001')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://example.com/v.mp4')
      expect(result.progress).toBe(100)
      expect(fetchMock.calls[0].url).toContain('/tasks/task-001')
    })

    it('RUNNING 状态映射', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'RUNNING', progress: 30 })])
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(30)
    })

    it('无 taskId 抛错', async () => {
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ id: 't' })])
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      try {
        await adapter.generateVideo({ promptImage: 'https://x/i.png' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new RunwayAdapter({ id: 'runway', apiKey: 'k' })
      try {
        await adapter.generateVideo({ promptImage: 'https://x/i.png' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
