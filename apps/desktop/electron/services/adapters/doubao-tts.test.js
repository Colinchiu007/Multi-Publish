// @ts-check
/**
 * doubao-tts.test.js — 豆包 TTS Adapter 测试
 *
 * 火山引擎语音合成 API 关键特性：
 * - 认证：Bearer token + app_id（凭证中携带 appid 与 token）
 * - synthesize: POST /api/v1/tts，请求体嵌套 app/user/audio/request 四段
 * - 响应 JSON 含 data 字段（Base64 编码的音频），需解码为 Buffer
 * - listVoices: 返回静态预定义音色列表 ['BV001','BV002','BV406','BV407']
 * - testConnection: 通过 validateConfig 验证（无网络请求）
 * - 不支持 LLM/Image/Video 方法
 * - synthesize 返回 { audio: Buffer, format, duration? }
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { DoubaoTtsAdapter, DOUBAO_VOICES } = require('./doubao-tts')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { BaseAdapter, ADAPTER_VERSION } = require('./_base/base')

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
      return new ArrayBuffer(8)
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

// 模拟 Base64 编码的音频数据
const MOCK_BASE64_AUDIO = Buffer.from('mock-audio-data').toString('base64')

describe('DoubaoTtsAdapter — 豆包 TTS Adapter', () => {
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
      const adapter = new DoubaoTtsAdapter({
        id: 'doubao',
        appId: 'test-app-id',
        token: 'test-token',
        baseUrl: 'https://openspeech.bytedance.com',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('doubao')
      expect(adapter.credentials.appId).toBe('test-app-id')
      expect(adapter.credentials.token).toBe('test-token')
      expect(adapter.credentials.baseUrl).toBe('https://openspeech.bytedance.com')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为火山引擎官方端点', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.credentials.baseUrl).toBe('https://openspeech.bytedance.com')
    })

    it('默认 cluster 为 volcano_tts', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.credentials.cluster).toBe('volcano_tts')
    })

    it('支持自定义 cluster', () => {
      const adapter = new DoubaoTtsAdapter({
        id: 'doubao',
        appId: 'app',
        token: 'tok',
        cluster: 'volcano_mega',
      })
      expect(adapter.credentials.cluster).toBe('volcano_mega')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 appId 和 token 时返回 valid', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 appId 时返回 invalid + errors', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', token: 'tok' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('appId is required')
    })

    it('无 token 时返回 invalid + errors', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('token is required')
    })

    it('同时缺 appId 和 token 返回多个 errors', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors).toContain('appId is required')
      expect(result.errors).toContain('token is required')
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法（synthesize/listVoices）', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.supports('synthesize')).toBe(true)
      expect(adapter.supports('listVoices')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('embeddings')).toBe(false)
    })

    it('不支持 Image/Video 方法', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 TTS 相关方法', () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listVoices')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('认证头', () => {
    it('请求头使用 Bearer token', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'my-token' })
      await adapter.synthesize({ text: '你好' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toContain('my-token')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('synthesize', () => {
    it('POST /api/v1/tts 返回 audio Buffer + format', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO, duration: '1.234' }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const result = await adapter.synthesize({ text: '你好世界' })

      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.format).toBe('mp3')
      expect(result.duration).toBe('1.234')

      // 验证 URL 包含 /api/v1/tts
      expect(fetchMock.calls[0].url).toContain('/api/v1/tts')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
    })

    it('请求体包含 app/user/audio/request 四段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({
        id: 'doubao',
        appId: 'my-app',
        token: 'my-token',
        cluster: 'volcano_tts',
      })
      await adapter.synthesize({ text: '测试', voice: 'BV002' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.app).toBeDefined()
      expect(body.app.appid).toBe('my-app')
      expect(body.app.token).toBe('my-token')
      expect(body.app.cluster).toBe('volcano_tts')
      expect(body.user).toBeDefined()
      expect(body.user.uid).toBe('user')
      expect(body.audio).toBeDefined()
      expect(body.audio.voice_type).toBe('BV002')
      expect(body.audio.encoding).toBe('mp3')
      expect(body.audio.speed_ratio).toBe(1.0)
      expect(body.request).toBeDefined()
      expect(body.request.text).toBe('测试')
      expect(body.request.operation).toBe('query')
      // reqid 应为 UUID 字符串
      expect(body.request.reqid).toBeTruthy()
      expect(typeof body.request.reqid).toBe('string')
    })

    it('每次请求生成不同的 reqid', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await adapter.synthesize({ text: '第一次' })
      await adapter.synthesize({ text: '第二次' })

      const reqid1 = JSON.parse(fetchMock.calls[0].opts.body).request.reqid
      const reqid2 = JSON.parse(fetchMock.calls[1].opts.body).request.reqid
      expect(reqid1).not.toBe(reqid2)
    })

    it('支持 format 参数覆盖默认 encoding', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const result = await adapter.synthesize({ text: 'Hi', format: 'wav' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audio.encoding).toBe('wav')
      expect(result.format).toBe('wav')
    })

    it('支持 speedRatio 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await adapter.synthesize({ text: 'Hi', speedRatio: 1.5 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audio.speed_ratio).toBe(1.5)
    })

    it('支持 operation 参数（submit）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await adapter.synthesize({ text: 'Hi', operation: 'submit' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.request.operation).toBe('submit')
    })

    it('无 text 参数抛错误', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await expect(adapter.synthesize({}))
        .rejects.toThrow(/text.*required/i)
    })

    it('空 text 抛错误', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await expect(adapter.synthesize({ text: '' }))
        .rejects.toThrow(/text.*required/i)
    })

    it('响应 code 非 3 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ code: 3001, message: 'Invalid voice type' }),
      ])
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('Invalid voice type')
      }
    })

    it('响应缺少 data 字段 → ProviderError', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ code: 3 }),
      ])
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('missing data')
      }
    })

    it('响应无 duration 时不附加 duration 字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const result = await adapter.synthesize({ text: 'Hi' })
      expect(result.duration).toBeUndefined()
    })
  })

  describe('listVoices', () => {
    it('返回静态预定义音色列表', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const voices = await adapter.listVoices()
      expect(voices).toEqual(['BV001', 'BV002', 'BV406', 'BV407'])
      expect(voices).toHaveLength(4)
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = vi.fn()
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      await adapter.listVoices()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('返回副本，修改不影响内部静态列表', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const voices1 = await adapter.listVoices()
      voices1.push('BV999')
      const voices2 = await adapter.listVoices()
      expect(voices2).toEqual(['BV001', 'BV002', 'BV406', 'BV407'])
      expect(voices2).not.toContain('BV999')
    })

    it('DOUBAO_VOICES 导出常量', () => {
      expect(DOUBAO_VOICES).toEqual(['BV001', 'BV002', 'BV406', 'BV407'])
    })
  })

  describe('testConnection', () => {
    it('配置有效返回 { success: true }', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(result.voices).toBe(4)
    })

    it('配置无效返回 { success: false, error }', async () => {
      const adapter = new DoubaoTtsAdapter({ id: 'doubao' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 3, data: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoTtsAdapter({
        id: 'doubao-proxy',
        appId: 'app',
        token: 'tok',
        baseUrl: 'https://my-proxy.com/volcengine',
      })
      await adapter.synthesize({ text: 'Hi' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('openspeech.bytedance.com')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('网络错误（ECONNREFUSED）→ ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('HTTP 错误处理', () => {
    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Invalid token' }, 401),
      ])
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'bad' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Rate limited' }, 429),
      ])
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Internal error' }, 500),
      ])
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
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
      const adapter = new DoubaoTtsAdapter({ id: 'doubao', appId: 'app', token: 'tok' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new DoubaoTtsAdapter({
        id: 'doubao',
        appId: 'app',
        token: 'tok',
        baseUrl: 'https://openspeech.bytedance.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('doubao')
      expect(info.baseUrl).toBe('https://openspeech.bytedance.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
