// @ts-check
/**
 * agnes-video.test.js — TDD: Agnes Video V2.0 Adapter 测试
 *
 * Agnes Video API 关键特性：
 * - 认证头 Authorization: Bearer {key}（sk- 开头密钥）
 * - generateVideo: POST /videos/generations（OpenAI 兼容协议）
 * - 请求体 { model: 'agnes-video-v2.0', prompt, image, width, height, num_frames, frame_rate, negative_prompt, seed }
 * - getVideoStatus: GET /videos/generations/{video_id}
 * - 状态映射：queued/in_progress → processing，completed → completed，failed → failed
 * - listModels: 静态返回 1 个模型
 * - testConnection: 验证 apiKey 存在
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { AgnesVideoAdapter, AGNES_VIDEO_MODELS } = require('./agnes-video')
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

describe('AgnesVideoAdapter — Agnes Video V2.0', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('构造与配置', () => {
    it('可实例化，接受 credentials + options 分离参数', () => {
      const adapter = new AgnesVideoAdapter({
        id: 'agnes-video',
        apiKey: 'sk-agnes-test-key',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      }, {
        timeout: 120000,
        maxRetries: 2,
      })
      expect(adapter).toBeInstanceOf(AgnesVideoAdapter)
      expect(adapter.id).toBe('agnes-video')
      expect(adapter.credentials.apiKey).toBe('sk-agnes-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://apihub.agnes-ai.com/v1')
      expect(adapter.options.timeout).toBe(120000)
    })

    it('默认 baseUrl 为 Agnes 官方端点', () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.credentials.baseUrl).toBe('https://apihub.agnes-ai.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it("supports('generateVideo') → true", () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.supports('generateVideo')).toBe(true)
    })

    it("supports('getVideoStatus') → true", () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.supports('getVideoStatus')).toBe(true)
    })

    it("supports('synthesize') → false（不支持 TTS）", () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.supports('synthesize')).toBe(false)
    })

    it("supports('chatCompletion') → false（不支持 LLM）", () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
    })

    it("capabilities() 返回 generateVideo + getVideoStatus", () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateVideo')
      expect(caps).toContain('getVideoStatus')
      expect(caps).not.toContain('synthesize')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('generateVideo', () => {
    it('POST /videos/generations 返回 { taskId, model }，默认参数正确', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ id: 'agnes-task-1' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.generateVideo({ prompt: '海浪拍岸' })

      expect(result.taskId).toBe('agnes-task-1')
      expect(result.model).toBe('agnes-video-v2.0')

      expect(fetchMock.calls[0].url).toContain('/videos/generations')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('海浪拍岸')
      expect(body.model).toBe('agnes-video-v2.0')
      // 默认参数
      expect(body.width).toBe(1152)
      expect(body.height).toBe(768)
      expect(body.num_frames).toBe(121)
      expect(body.frame_rate).toBe(24)
      // 未传字段为 undefined
      expect(body.image).toBeUndefined()
      expect(body.negative_prompt).toBeUndefined()
      expect(body.seed).toBeUndefined()
    })

    it('请求头使用 Authorization Bearer', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ id: 't1' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await adapter.generateVideo({ prompt: 'a cat' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer sk-test')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('兼容 task_id 字段（非 id）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ task_id: 'agnes-task-alt' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.generateVideo({ prompt: 'test' })
      expect(result.taskId).toBe('agnes-task-alt')
    })

    it('image 参数映射到请求体（图生视频）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ id: 't2' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await adapter.generateVideo({
        prompt: '让图片动起来',
        image: 'https://cdn.example.com/img.png',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.image).toBe('https://cdn.example.com/img.png')
    })

    it('自定义 numFrames / frameRate / width / height', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ id: 't3' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await adapter.generateVideo({
        prompt: 'test',
        numFrames: 201,  // 8*25+1
        frameRate: 30,
        width: 1920,
        height: 1080,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.num_frames).toBe(201)
      expect(body.frame_rate).toBe(30)
      expect(body.width).toBe(1920)
      expect(body.height).toBe(1080)
    })

    it('negativePrompt + seed 参数映射', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ id: 't4' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await adapter.generateVideo({
        prompt: 'test',
        negativePrompt: '模糊, 低质量',
        seed: 42,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.negative_prompt).toBe('模糊, 低质量')
      expect(body.seed).toBe(42)
    })

    it('无 prompt 抛错', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await expect(adapter.generateVideo({}))
        .rejects.toThrow(/prompt.*required/i)
    })

    it('响应缺少 id/task_id → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ foo: 'bar' }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      try {
        await adapter.generateVideo({ prompt: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-bad' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'rate limited' }, 429),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      try {
        await adapter.generateVideo({ prompt: 'test' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })
  })

  describe('getVideoStatus', () => {
    it('GET /videos/generations/{video_id} 返回状态', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          status: 'completed',
          url: 'https://cdn.example.com/v.mp4',
          progress: 100,
        }),
      ])
      global.fetch = fetchMock

      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('agnes-task-1')

      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('https://cdn.example.com/v.mp4')
      expect(result.progress).toBe(100)
      expect(fetchMock.calls[0].url).toContain('/videos/generations/agnes-task-1')
    })

    it('queued → processing', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ status: 'queued', progress: 0 }),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(0)
      expect(result.videoUrl).toBe('')
    })

    it('in_progress → processing', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ status: 'in_progress', progress: 45 }),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('processing')
      expect(result.progress).toBe(45)
      expect(result.videoUrl).toBe('')
    })

    it('failed → failed', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ status: 'failed', progress: 0 }),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('failed')
      expect(result.videoUrl).toBe('')
    })

    it('completed 时无 url → videoUrl 为空字符串', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ status: 'completed', progress: 100 }),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.status).toBe('completed')
      expect(result.videoUrl).toBe('')
    })

    it('无 progress 时 completed 默认 100，processing 默认 0', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ status: 'completed' }),
      ])
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.getVideoStatus('t1')
      expect(result.progress).toBe(100)
    })

    it('无 taskId 抛错', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await expect(adapter.getVideoStatus('')).rejects.toThrow(/taskId.*required/i)
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 Agnes Video 模型列表（1 个）', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('agnes-video-v2.0')
      expect(models[0].name).toBe('Agnes Video V2.0')
      expect(models[0].description).toBe('Agnes 视频生成模型')
    })

    it('与导出的 AGNES_VIDEO_MODELS 常量一致', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const models = await adapter.listModels()
      expect(models).toEqual(AGNES_VIDEO_MODELS.map(m => ({ ...m })))
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('apiKey 存在时返回 { success: true }', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('apiKey 缺失时返回 { success: false, error }', async () => {
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })

    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new AgnesVideoAdapter({ id: 'agnes-video', apiKey: 'sk-test' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
