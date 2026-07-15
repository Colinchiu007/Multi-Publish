// @ts-check
/**
 * piper.test.js — Piper 本地 TTS Adapter 测试
 *
 * Piper HTTP 服务器关键特性：
 * - 无需认证（本地服务，默认 http://localhost:5000）
 * - synthesize: POST /，请求体 JSON { text, model, speaker? }
 *   或直接 POST /?text=xxx&model=xxx（query 参数模式）
 * - 响应为二进制 WAV 音频流（非 Base64，非 JSON）
 * - listVoices: GET /models 返回可用模型列表
 * - testConnection: GET /models 检查服务是否在线
 * - validateConfig: baseUrl 必填，apiKey 可选
 * - 不支持 LLM/Image/Video 方法
 * - synthesize 返回 { audio: ArrayBuffer, format: 'wav' }
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { PiperAdapter } = require('./piper')
const { ProviderError, ERROR_CODES } = require('./provider-error')
const { BaseAdapter, ADAPTER_VERSION } = require('./base')

// ─── fetch mock 工具 ───
function createFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
    async arrayBuffer() {
      if (body instanceof ArrayBuffer) return body
      return new ArrayBuffer(16)
    },
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

describe('PiperAdapter — Piper 本地 TTS Adapter', () => {
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
      const adapter = new PiperAdapter({
        id: 'piper',
        baseUrl: 'http://localhost:5000',
      }, {
        timeout: 30000,
        maxRetries: 1,
      })
      expect(adapter.id).toBe('piper')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:5000')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 http://localhost:5000', () => {
      const adapter = new PiperAdapter({ id: 'piper' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:5000')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new PiperAdapter({ id: 'piper' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })

    it('支持自定义 baseUrl（远程 Piper 实例）', () => {
      const adapter = new PiperAdapter({
        id: 'piper-remote',
        baseUrl: 'https://piper.example.com',
      })
      expect(adapter.credentials.baseUrl).toBe('https://piper.example.com')
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 baseUrl 时返回 invalid + errors', () => {
      const adapter = new PiperAdapter({ id: 'piper' })
      // 构造函数会注入默认 baseUrl，手动清空以测试 validateConfig 逻辑
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })

    it('apiKey 可选（不传也 valid）', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('有 apiKey 时也 valid（远程鉴权）', () => {
      const adapter = new PiperAdapter({
        id: 'piper',
        baseUrl: 'http://localhost:5000',
        apiKey: 'remote-token',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法（synthesize/listVoices）', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      expect(adapter.supports('synthesize')).toBe(true)
      expect(adapter.supports('listVoices')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('embeddings')).toBe(false)
    })

    it('不支持 Image/Video 方法', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 TTS 相关方法', () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listVoices')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('认证（apiKey 可选）', () => {
    it('无 apiKey 时不设置 Authorization 头', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(16)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({ text: 'Hello' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBeUndefined()
    })

    it('有 apiKey 时设置 Bearer 头', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(16)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({
        id: 'piper',
        baseUrl: 'http://localhost:5000',
        apiKey: 'remote-token',
      })
      await adapter.synthesize({ text: 'Hello' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer remote-token')
    })
  })

  describe('synthesize', () => {
    it('POST / 返回 audio ArrayBuffer + format wav', async () => {
      const audioBuffer = new ArrayBuffer(32)
      const fetchMock = createFetchMock([
        createFetchResponse(audioBuffer, 200, { 'content-type': 'audio/wav' }),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const result = await adapter.synthesize({ text: 'Hello world' })

      expect(result.audio).toBeInstanceOf(ArrayBuffer)
      expect(result.format).toBe('wav')

      // 验证 URL 路径
      expect(fetchMock.calls[0].url).toContain('http://localhost:5000/')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
    })

    it('请求体包含 text 字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({ text: 'Test text' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.text).toBe('Test text')
    })

    it('支持 model 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({
        text: 'Hi',
        model: 'en_US-lessac-medium',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('en_US-lessac-medium')
    })

    it('支持 speaker 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({ text: 'Hi', speaker: 1 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.speaker).toBe(1)
    })

    it('支持 lengthScale 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({ text: 'Hi', lengthScale: 0.8 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.lengthScale).toBe(0.8)
    })

    it('useQueryParams 模式：参数作为 query string', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8)),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await adapter.synthesize({
        text: 'Hi',
        model: 'en_US-lessac-medium',
        useQueryParams: true,
      })

      // URL 应包含 query 参数
      expect(fetchMock.calls[0].url).toContain('text=Hi')
      expect(fetchMock.calls[0].url).toContain('model=en_US-lessac-medium')
      // 不应有 body
      expect(fetchMock.calls[0].opts.body).toBeUndefined()
    })

    it('无 text 参数抛错误', async () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await expect(adapter.synthesize({}))
        .rejects.toThrow(/text.*required/i)
    })

    it('空 text 抛错误', async () => {
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      await expect(adapter.synthesize({ text: '' }))
        .rejects.toThrow(/text.*required/i)
    })
  })

  describe('listVoices', () => {
    it('GET /models 返回模型列表（数组格式）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([
          { name: 'en_US-lessac-medium', language: 'en_US', path: '/models/en_US-lessac-medium' },
          { name: 'zh_CN-huayan-medium', language: 'zh_CN', path: '/models/zh_CN-huayan-medium' },
        ]),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const voices = await adapter.listVoices()
      expect(voices).toHaveLength(2)
      expect(voices[0].name).toBe('en_US-lessac-medium')
      expect(voices[0].language).toBe('en_US')

      expect(fetchMock.calls[0].url).toContain('/models')
    })

    it('GET /models 兼容 { models: [...] } 格式', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({
          models: [
            { name: 'model1' },
            { name: 'model2' },
          ],
        }),
      ])
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const voices = await adapter.listVoices()
      expect(voices).toHaveLength(2)
      expect(voices[0].name).toBe('model1')
    })

    it('GET /models 兼容字符串数组格式', async () => {
      global.fetch = createFetchMock([
        createFetchResponse(['en_US-lessac-medium', 'zh_CN-huayan-medium']),
      ])
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const voices = await adapter.listVoices()
      expect(voices).toHaveLength(2)
      expect(voices[0].name).toBe('en_US-lessac-medium')
    })

    it('models 为空时返回空数组', async () => {
      global.fetch = createFetchMock([
        createFetchResponse([]),
      ])
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const voices = await adapter.listVoices()
      expect(voices).toEqual([])
    })
  })

  describe('testConnection', () => {
    it('服务在线返回 { success: true }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([{ name: 'en_US-lessac-medium' }]),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(result.voices).toBe(1)
    })

    it('服务离线（ECONNREFUSED）返回 { success: false, error }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([]),
      ])
      global.fetch = fetchMock

      const adapter = new PiperAdapter({
        id: 'piper-remote',
        baseUrl: 'https://piper.example.com',
      })
      await adapter.listVoices()

      expect(fetchMock.calls[0].url).toContain('piper.example.com')
      expect(fetchMock.calls[0].url).not.toContain('localhost:5000')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('网络错误（ENOTFOUND）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ENOTFOUND') })
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('HTTP 错误处理', () => {
    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Invalid token' }, 401),
      ])
      const adapter = new PiperAdapter({
        id: 'piper',
        baseUrl: 'http://localhost:5000',
        apiKey: 'bad-token',
      })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.message).toContain('Invalid token')
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Rate limited' }, 429),
      ])
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'Internal server error' }, 500),
      ])
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('非 JSON 错误响应（纯文本）→ ProviderError', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway' },
      }))
      const adapter = new PiperAdapter({ id: 'piper', baseUrl: 'http://localhost:5000' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new PiperAdapter({
        id: 'piper',
        baseUrl: 'http://localhost:5000',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('piper')
      expect(info.baseUrl).toBe('http://localhost:5000')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
