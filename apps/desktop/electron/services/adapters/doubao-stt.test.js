// @ts-check
/**
 * doubao-stt.test.js — 豆包（字节跳动）语音识别 Adapter 测试
 *
 * 豆包 ASR API 关键特性：
 * - 认证：app_id + token（在请求体内，非 Authorization Header）
 * - baseUrl: https://openspeech.bytedance.com，端点 /api/v2/asr
 * - transcribe: POST /api/v2/asr，请求体含 app/user/audio/request 四段
 * - 返回 { code: 1000, message: "Success", result: ["识别文本"], duration: 5.0 }
 * - testConnection: 通过最小 asr 请求验证认证
 *
 * 验证维度：
 * - 构造与配置（默认 baseUrl、cluster 默认值、版本号）
 * - validateConfig（app_id 和 token 必填）
 * - capabilities 包含 'transcribe'（手动添加）
 * - transcribe 成功调用（验证 URL、headers、body 结构含 app/audio/request）
 * - 错误处理（401/429/500 → ProviderError，业务码非 1000 → PROVIDER_ERROR）
 * - testConnection（成功/认证失败）
 * - 网络错误分类（TIMEOUT / NETWORK_ERROR）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { DoubaoSttAdapter } = require('./doubao-stt')
const { ProviderError, ERROR_CODES } = require('./provider-error')
const { ADAPTER_VERSION } = require('./base')

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

describe('DoubaoSttAdapter — 豆包（字节跳动）语音识别', () => {
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
      const adapter = new DoubaoSttAdapter({
        id: 'doubao-stt',
        app_id: 'dou-app',
        token: 'dou-token',
        baseUrl: 'https://openspeech.bytedance.com',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('doubao-stt')
      expect(adapter.credentials.app_id).toBe('dou-app')
      expect(adapter.credentials.token).toBe('dou-token')
      expect(adapter.credentials.baseUrl).toBe('https://openspeech.bytedance.com')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为字节跳动官方端点', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.credentials.baseUrl).toBe('https://openspeech.bytedance.com')
    })

    it('默认 cluster 为 volcano_asr', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.credentials.cluster).toBe('volcano_asr')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 app_id + token 时返回 valid', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 app_id 时返回 invalid', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: '', token: 't' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('app_id is required')
    })

    it('无 token 时返回 invalid', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('token is required')
    })
  })

  describe('能力协商', () => {
    it('支持 testConnection', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Image/Video 方法', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })

    it('capabilities() 包含 transcribe（手动添加）', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const caps = adapter.capabilities()
      expect(caps).toContain('transcribe')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })

    it('supports("transcribe") 因不在 KNOWN_METHODS 中返回 false', () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      expect(adapter.supports('transcribe')).toBe(false)
    })
  })

  describe('认证方式（关键差异：app_id + token 在请求体内）', () => {
    it('请求体含 app.appid 和 app.token', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, message: 'Success', result: ['hello'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou-app', token: 'dou-secret' })
      await adapter.transcribe({ audio: 'base64data' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.app.appid).toBe('dou-app')
      expect(body.app.token).toBe('dou-secret')
      expect(body.app.cluster).toBe('volcano_asr')
    })

    it('请求 URL 为 /api/v2/asr', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      await adapter.transcribe({ audio: 'data' })

      expect(fetchMock.calls[0].url).toContain('/api/v2/asr')
    })
  })

  describe('transcribe', () => {
    it('POST /api/v2/asr 返回识别结果', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          code: 1000,
          message: 'Success',
          result: ['你好世界'],
          duration: 5.0,
        }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = await adapter.transcribe({ audio: 'base64data' })

      expect(result.text).toBe('你好世界')
      expect(result.language).toBe('zh')
      expect(result.duration).toBe(5.0)
    })

    it('请求体含完整四段结构（app/user/audio/request）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      await adapter.transcribe({ audio: 'base64abc' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.app).toBeDefined()
      expect(body.user).toBeDefined()
      expect(body.audio).toBeDefined()
      expect(body.request).toBeDefined()

      expect(body.audio.format).toBe('wav')
      expect(body.audio.rate).toBe(16000)
      expect(body.audio.bits).toBe(16)
      expect(body.audio.channel).toBe(1)
      expect(body.audio.data).toBe('base64abc')

      expect(body.request.nbest).toBe(1)
      expect(body.request.sequence).toBe(-1)
      expect(body.request.reqid).toBeTruthy()
    })

    it('每次调用生成唯一 reqid', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: ['hi'] }),
        createFetchResponse({ code: 1000, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      await adapter.transcribe({ audio: 'data1' })
      await adapter.transcribe({ audio: 'data2' })

      const reqid1 = JSON.parse(fetchMock.calls[0].opts.body).request.reqid
      const reqid2 = JSON.parse(fetchMock.calls[1].opts.body).request.reqid
      expect(reqid1).toBeTruthy()
      expect(reqid2).toBeTruthy()
      expect(reqid1).not.toBe(reqid2)
    })

    it('支持 language 参数（用于返回字段）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: ['hello'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = await adapter.transcribe({ audio: 'data', language: 'en' })

      expect(result.language).toBe('en')
    })

    it('无 audio 参数抛 INVALID_CONFIG', async () => {
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({})
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG)
      }
    })

    it('业务码非 1000 → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1001, message: 'Audio format error' }, 200),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('1001')
      }
    })

    it('result 为字符串时也能解析', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: '直接字符串结果' }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = await adapter.transcribe({ audio: 'data' })
      expect(result.text).toBe('直接字符串结果')
    })
  })

  describe('错误处理', () => {
    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Invalid token' }, 401),
      ])
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 'bad' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Rate limited' }, 429),
      ])
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
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
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('非 JSON 错误响应 → ProviderError', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        headers: new Map(),
        async json() { throw new Error('not JSON') },
        async text() { return 'Bad Gateway' },
      }))
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: [''] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('401 认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ message: 'Invalid token' }, 401),
      ])
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 'bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('业务错误（HTTP 200）但认证通过视为 success: true', async () => {
      // 空音频可能返回业务错误码，但 HTTP 200 说明认证通过
      global.fetch = createFetchMock([
        createFetchResponse({ code: 1001, message: 'Audio format error' }, 200),
      ])
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('ECONNREFUSED → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('ENOTFOUND → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ENOTFOUND openspeech.bytedance.com') })
      const adapter = new DoubaoSttAdapter({ id: 'doubao-stt', app_id: 'dou', token: 't' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ code: 1000, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new DoubaoSttAdapter({
        id: 'doubao-proxy',
        app_id: 'dou',
        token: 't',
        baseUrl: 'https://my-proxy.com',
      })
      await adapter.transcribe({ audio: 'data' })

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('openspeech.bytedance.com')
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new DoubaoSttAdapter({
        id: 'doubao-stt',
        app_id: 'dou',
        token: 't',
        baseUrl: 'https://openspeech.bytedance.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('doubao-stt')
      expect(info.baseUrl).toBe('https://openspeech.bytedance.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
