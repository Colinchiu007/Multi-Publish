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
      expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
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
    it('POST /video_generation 返回 { taskId, model }，默认参数正确', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 'mm-task-1' })])
      global.fetch = fetchMock

      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: '海浪' })

      expect(result.taskId).toBe('mm-task-1')
      expect(result.model).toBe('MiniMax-Hailuo-2.3')

      expect(fetchMock.calls[0].url).toContain('/video_generation')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('海浪')
      expect(body.model).toBe('MiniMax-Hailuo-2.3')
      // 默认参数
      expect(body.duration).toBe(6)
      expect(body.resolution).toBe('768P')
      expect(body.prompt_optimizer).toBe(true)
      // 未传 first_frame_image 为 undefined
      expect(body.first_frame_image).toBeUndefined()
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('自定义 model', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 't1' })])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.generateVideo({ prompt: 'x', model: 'T2V-01' })
      expect(result.model).toBe('T2V-01')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('T2V-01')
    })

    it('自定义 duration=10', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 't1' })])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await adapter.generateVideo({ prompt: 'x', duration: 10 })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.duration).toBe(10)
    })

    it('自定义 resolution=1080P', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 't1' })])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await adapter.generateVideo({ prompt: 'x', resolution: '1080P' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.resolution).toBe('1080P')
    })

    it('firstFrameImage 映射到 first_frame_image（图生视频）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 't1' })])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await adapter.generateVideo({
        prompt: 'x',
        firstFrameImage: 'https://cdn.example.com/first.png',
      })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.first_frame_image).toBe('https://cdn.example.com/first.png')
    })

    it('prompt_optimizer 始终为 true', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ task_id: 't1' })])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await adapter.generateVideo({ prompt: 'x' })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt_optimizer).toBe(true)
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
      // videoUrl 使用配置的 baseUrl（minimaxi）+ file_id
      expect(result.videoUrl).toContain('file_id=file-123')
      expect(result.videoUrl).toContain('https://api.minimaxi.com/v1/files/retrieve')
      expect(fetchMock.calls[0].url).toContain('/query/video_generation')
      expect(fetchMock.calls[0].url).toContain('task_id=mm-task-1')
    })

    it('Preparing → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'Preparing', progress: 0 })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(0)
    })

    it('Queueing → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'Queueing', progress: 10 })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(10)
    })

    it('Processing → processing', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'Processing', progress: 30 })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(30)
    })

    it('Fail → failed', async () => {
      global.fetch = createFetchMock([createFetchResponse({ status: 'Fail', progress: 0 })])
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('failed')
      expect(result.videoUrl).toBe('')
    })

    it('无 taskId 抛错', async () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('listModels', () => {
    it('返回 4 个预定义模型', async () => {
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(4)
      const ids = models.map(m => m.id)
      expect(ids).toEqual(['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02', 'T2V-01', 'I2V-01'])
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new MiniMaxAdapter({ id: 'minimax', apiKey: 'k' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
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
