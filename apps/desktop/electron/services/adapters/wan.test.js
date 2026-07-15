// @ts-check
/**
 * wan.test.js — 阿里万相 Wan Video Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo、getVideoStatus、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { WanAdapter } = require('./wan')
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

describe('WanAdapter — 阿里万相', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new WanAdapter({
        id: 'wan', apiKey: 'dashscope-key', baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('wan')
      expect(adapter.credentials.apiKey).toBe('dashscope-key')
    })
    it('默认 baseUrl', () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://dashscope.aliyuncs.com/api/v1')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo', () => {
    it('POST /services/video-generation/video-synthesis 返回 { taskId, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        output: { task_id: 'task-aaa' },
      })])
      global.fetch = fetchMock

      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '山水画' })

      expect(result.taskId).toBe('task-aaa')
      expect(result.model).toBe('wan-video')

      expect(fetchMock.calls[0].url).toContain('/services/video-generation/video-synthesis')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.input.prompt).toBe('山水画')
      expect(body.model).toBe('wan-video')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('无 prompt 抛错', async () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'Bad key' }, 401)])
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'rate' }, 429)])
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /tasks/{taskId} 返回状态（SUCCEEDED）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://example.com/v.mp4',
          task_metrics: { total: 1, succeeded: 1 },
        },
      })])
      global.fetch = fetchMock

      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      const result = await adapter.getVideoStatus('task-aaa')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://example.com/v.mp4')
      expect(result.progress).toBe(100)
      expect(fetchMock.calls[0].url).toContain('/tasks/task-aaa')
    })

    it('RUNNING → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({
        output: { task_status: 'RUNNING' },
      })])
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
    })

    it('无 taskId 抛错', async () => {
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ output: { task_id: 't' } })])
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new WanAdapter({ id: 'wan', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
