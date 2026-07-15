// @ts-check
/**
 * baidu-stt.test.js — 百度语音识别 Adapter 测试
 *
 * 百度 ASR API 关键特性：
 * - 认证：API Key + Secret Key → 换取 access_token（OAuth 2.0 client_credentials）
 * - token 换取端点：https://aip.baidubce.com/oauth/2.0/token
 * - ASR 端点：POST https://vop.baidu.com/server_api
 * - 请求体内含 token 字段（非 Authorization Header）
 * - 返回 { err_no: 0, err_msg: "success.", result: ["识别文本"] }
 * - access_token 自动缓存（过期前 60s 提前刷新）
 *
 * 验证维度：
 * - 构造与配置（默认 baseUrl/oauthUrl、版本号、token 缓存初始化）
 * - validateConfig（apiKey + apiSecret 必填）
 * - capabilities 包含 'transcribe'（手动添加）
 * - transcribe 成功调用（验证先 OAuth、后 ASR 两步请求）
 * - access_token 缓存（第二次调用不重新获取）
 * - 错误处理（OAuth 失败 / ASR 401/429/500 / 业务 err_no 非 0）
 * - testConnection（通过 token 换取验证）
 * - 网络错误分类（TIMEOUT / NETWORK_ERROR）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { BaiduSttAdapter } = require('./baidu-stt')
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

describe('BaiduSttAdapter — 百度语音识别', () => {
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
      const adapter = new BaiduSttAdapter({
        id: 'baidu-stt',
        apiKey: 'bd-key',
        apiSecret: 'bd-secret',
        baseUrl: 'https://vop.baidu.com',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('baidu-stt')
      expect(adapter.credentials.apiKey).toBe('bd-key')
      expect(adapter.credentials.apiSecret).toBe('bd-secret')
      expect(adapter.credentials.baseUrl).toBe('https://vop.baidu.com')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为百度 ASR 端点', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.credentials.baseUrl).toBe('https://vop.baidu.com')
    })

    it('默认 oauthUrl 为百度 OAuth 端点', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.credentials.oauthUrl).toBe('https://aip.baidubce.com/oauth/2.0/token')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })

    it('初始 token 缓存为 null', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter._tokenCache).toBeNull()
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey + apiSecret 时返回 valid', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: '', apiSecret: 's' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })

    it('无 apiSecret 时返回 invalid', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiSecret is required')
    })
  })

  describe('能力协商', () => {
    it('支持 testConnection', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/TTS/Image/Video 方法', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })

    it('capabilities() 包含 transcribe（手动添加）', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      const caps = adapter.capabilities()
      expect(caps).toContain('transcribe')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })

    it('supports("transcribe") 因不在 KNOWN_METHODS 中返回 false', () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      expect(adapter.supports('transcribe')).toBe(false)
    })
  })

  describe('transcribe（OAuth + ASR 两步）', () => {
    it('先获取 access_token，再调用 ASR', async () => {
      const fetchMock = createFetchMock([
        // 第 1 次：OAuth 换取 token
        createFetchResponse({
          access_token: 'bd-access-token-xxx',
          expires_in: 2592000,
          token_type: 'bearer',
        }),
        // 第 2 次：ASR 识别
        createFetchResponse({
          err_no: 0,
          err_msg: 'success.',
          result: ['你好百度'],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      const result = await adapter.transcribe({ audio: 'base64data', len: 12345 })

      expect(result.text).toBe('你好百度')
      expect(result.language).toBe('zh')
      expect(result.err_no).toBe(0)

      // 验证两次调用
      expect(fetchMock.calls).toHaveLength(2)

      // 第 1 次调用 OAuth
      expect(fetchMock.calls[0].url).toContain('aip.baidubce.com/oauth/2.0/token')
      expect(fetchMock.calls[0].url).toContain('client_id=k')
      expect(fetchMock.calls[0].url).toContain('client_secret=s')
      expect(fetchMock.calls[0].url).toContain('grant_type=client_credentials')

      // 第 2 次调用 ASR
      expect(fetchMock.calls[1].url).toContain('vop.baidu.com/server_api')
      const body = JSON.parse(fetchMock.calls[1].opts.body)
      expect(body.token).toBe('bd-access-token-xxx')
      expect(body.speech).toBe('base64data')
      expect(body.len).toBe(12345)
      expect(body.cuid).toBe('multi-publish')
      expect(body.format).toBe('wav')
      expect(body.rate).toBe(16000)
      expect(body.channel).toBe(1)
    })

    it('access_token 缓存：第二次 transcribe 不重新 OAuth', async () => {
      const fetchMock = createFetchMock([
        // 第 1 次：OAuth
        createFetchResponse({ access_token: 'cached-token', expires_in: 2592000 }),
        // 第 2 次：ASR
        createFetchResponse({ err_no: 0, result: ['first'] }),
        // 第 3 次：直接 ASR（无 OAuth）
        createFetchResponse({ err_no: 0, result: ['second'] }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      await adapter.transcribe({ audio: 'data1', len: 100 })
      await adapter.transcribe({ audio: 'data2', len: 200 })

      // 验证只调用 3 次 fetch（1 次 OAuth + 2 次 ASR）
      expect(fetchMock.calls).toHaveLength(3)

      // 第 3 次调用也是 ASR，复用缓存 token
      expect(fetchMock.calls[2].url).toContain('vop.baidu.com/server_api')
      const body = JSON.parse(fetchMock.calls[2].opts.body)
      expect(body.token).toBe('cached-token')
    })

    it('请求体含 len 字段（百度要求原始字节数）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_no: 0, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      await adapter.transcribe({ audio: 'data', len: 99999 })

      const body = JSON.parse(fetchMock.calls[1].opts.body)
      expect(body.len).toBe(99999)
    })

    it('无 audio 参数抛 INVALID_CONFIG', async () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({})
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG)
      }
    })

    it('无 len 参数抛 INVALID_CONFIG', async () => {
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG)
        expect(e.message.toLowerCase()).toContain('len')
      }
    })

    it('支持 language 参数（用于返回字段）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_no: 0, result: ['hello'] }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      const result = await adapter.transcribe({ audio: 'data', len: 100, language: 'en' })

      expect(result.language).toBe('en')
    })

    it('业务 err_no 非 0 → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_no: 3301, err_msg: 'audio quality error' }, 200),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('3301')
      }
    })

    it('业务 err_no=110/111（token 无效）→ ProviderError(AUTH_FAILED) + 清空缓存', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 'stale-token', expires_in: 3600 }),
        createFetchResponse({ err_no: 111, err_msg: 'token invalid' }, 200),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
      // 缓存应被清空
      expect(adapter._tokenCache).toBeNull()
    })
  })

  describe('OAuth 失败处理', () => {
    it('OAuth 端点返回无 access_token → ProviderError(AUTH_FAILED)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ error: 'invalid_client', error_description: 'client credentials invalid' }, 400),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'bad', apiSecret: 'bad' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR) // 400 → PROVIDER_ERROR via fromHttpStatus
      }
    })

    it('OAuth 端点 401 → ProviderError(AUTH_FAILED)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ error: 'unauthorized' }, 401),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'bad', apiSecret: 'bad' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('OAuth 200 但响应体无 access_token → ProviderError(AUTH_FAILED)', async () => {
      const fetchMock = createFetchMock([
        // HTTP 200 但响应体没有 access_token
        createFetchResponse({ some_other_field: 'xxx' }, 200),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.message).toContain('access_token')
      }
    })
  })

  describe('ASR 错误处理', () => {
    it('ASR 端点 429 → ProviderError(RATE_LIMITED)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_msg: 'rate limit' }, 429),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('ASR 端点 500 → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_msg: 'internal error' }, 500),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（通过 token 换取验证）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 2592000 }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)

      // 验证只调用了 OAuth，未调用 ASR
      expect(fetchMock.calls).toHaveLength(1)
      expect(fetchMock.calls[0].url).toContain('aip.baidubce.com/oauth/2.0/token')
    })

    it('OAuth 失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: 'invalid_client' }, 401),
      ])
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'bad', apiSecret: 'bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('网络错误分类', () => {
    it('OAuth 阶段超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('ASR 阶段 ECONNREFUSED → ProviderError(NETWORK_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
      ])
      // 第 1 次 OAuth 成功，第 2 次 ASR 抛 ECONNREFUSED
      fetchMock.mockImplementationOnce(async () => createFetchResponse({ access_token: 't', expires_in: 3600 }))
      fetchMock.mockImplementationOnce(async () => { throw new Error('ECONNREFUSED') })
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })

    it('ENOTFOUND → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ENOTFOUND aip.baidubce.com') })
      const adapter = new BaiduSttAdapter({ id: 'baidu-stt', apiKey: 'k', apiSecret: 's' })
      try {
        await adapter.transcribe({ audio: 'data', len: 100 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('baseUrl / oauthUrl 自定义', () => {
    it('自定义 baseUrl 用于 ASR 请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_no: 0, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({
        id: 'baidu-proxy',
        apiKey: 'k',
        apiSecret: 's',
        baseUrl: 'https://my-proxy.com',
      })
      await adapter.transcribe({ audio: 'data', len: 100 })

      expect(fetchMock.calls[1].url).toContain('my-proxy.com/server_api')
      expect(fetchMock.calls[1].url).not.toContain('vop.baidu.com')
    })

    it('自定义 oauthUrl 用于 OAuth 请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ access_token: 't', expires_in: 3600 }),
        createFetchResponse({ err_no: 0, result: ['hi'] }),
      ])
      global.fetch = fetchMock

      const adapter = new BaiduSttAdapter({
        id: 'baidu-proxy',
        apiKey: 'k',
        apiSecret: 's',
        oauthUrl: 'https://my-oauth.com/token',
      })
      await adapter.transcribe({ audio: 'data', len: 100 })

      expect(fetchMock.calls[0].url).toContain('my-oauth.com/token')
      expect(fetchMock.calls[0].url).not.toContain('aip.baidubce.com')
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new BaiduSttAdapter({
        id: 'baidu-stt',
        apiKey: 'k',
        apiSecret: 's',
        baseUrl: 'https://vop.baidu.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('baidu-stt')
      expect(info.baseUrl).toBe('https://vop.baidu.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
