// @ts-check
/**
 * minimax.test.js — MiniMax Video Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商、generateVideo、getVideoStatus、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { MiniMaxAdapter } = require('./minimax')
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

describe('MiniMaxAdapter — MiniMax Video', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new MiniMaxAdapter({
        id: 'minimax', apiKey: 'mm-key', baseUrl: 'https://api.minimax.chat/v1',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('minimax')
      expect(adapter.credentials.apiKey).toBe('mm-key')
    })
    it('默认 baseUrl', () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://api.minimax.chat/v1')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo', () => {
    it('POST /video_generation 返回 { taskId, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 'mm-task-1' })])
      global.fetch = fetchMock

      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '海浪' })

      expect(result.taskId).toBe('mm-task-1')
      expect(result.model).toBe('minimax-video')

      expect(fetchMock.calls[0].url).toContain('/video_generation')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('海浪')
      expect(body.model).toBe('minimax-video')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('无 prompt 抛错', async () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ base_resp: { status_msg: 'Bad key' } }, 401)])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'bad' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ message: 'rate' }, 429)])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /query/video_generation?task_id={taskId} 返回状态', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        status: 'Success',
        file_id: 'file-123',
        progress: 100,
      })])
      global.fetch = fetchMock

      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('mm-task-1')

      expect(result.status).toBe('completed')
      expect(result.progress).toBe(100)
      expect(result.videoUrl).toContain('file_id=file-123')
      expect(fetchMock.calls[0].url).toContain('/query/video_generation')
      expect(fetchMock.calls[0].url).toContain('task_id=mm-task-1')
    })

    it('Processing → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'Processing', progress: 30 })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(30)
    })

    it('无 taskId 抛错', async () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ task_id: 't' })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
