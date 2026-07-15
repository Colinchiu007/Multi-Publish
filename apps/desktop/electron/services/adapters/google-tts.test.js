// @ts-check
/**
 * google-tts.test.js — Google Cloud Text-to-Speech Adapter 测试
 *
 * Google Cloud TTS API 关键特性：
 * - 认证：API Key 作为 query param ?key=xxx（默认），或 accessToken 作为 Bearer 头
 * - synthesize: POST /v1/text:synthesize，请求体含 input/voice/audioConfig
 * - 响应 JSON 含 audioContent 字段（Base64 编码的音频），需解码为 Buffer
 * - listVoices: GET /v1/voices 返回 { voices: [{ name, languageCodes, ... }] }
 * - testConnection: 通过 listVoices 验证认证
 * - 不支持 LLM/Image/Video 方法
 * - synthesize 返回 { audio: Buffer, format }
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { GoogleTtsAdapter } = require('./google-tts')
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
    async arrayBuffer() { return new ArrayBuffer(8) },
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
const MOCK_BASE64_AUDIO = Buffer.from('mock-google-audio').toString('base64')

describe('GoogleTtsAdapter — Google Cloud TTS Adapter', () => {
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
      const adapter = new GoogleTtsAdapter({
        id: 'google-tts',
        apiKey: 'google-test-key',
        baseUrl: 'https://texttospeech.googleapis.com',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('google-tts')
      expect(adapter.credentials.apiKey).toBe('google-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://texttospeech.googleapis.com')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 Google TTS 官方端点', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.credentials.baseUrl).toBe('https://texttospeech.googleapis.com')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 但有 accessToken 时返回 valid（OAuth2 模式）', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', accessToken: 'oauth-token' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('同时无 apiKey 和 accessToken 时返回 invalid + errors', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required (or accessToken for OAuth2)')
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法（synthesize/listVoices）', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.supports('synthesize')).toBe(true)
      expect(adapter.supports('listVoices')).toBe(true)
    })

    it('支持 testConnection', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('embeddings')).toBe(false)
    })

    it('不支持 Image/Video 方法', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 TTS 相关方法', () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listVoices')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('认证（apiKey 作为 query param）', () => {
    it('请求 URL 包含 ?key=xxx', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'my-key' })
      await adapter.synthesize({ text: 'Hello' })

      expect(fetchMock.calls[0].url).toContain('key=my-key')
    })

    it('apiKey 模式不设置 Authorization 头', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'my-key' })
      await adapter.synthesize({ text: 'Hello' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('认证（accessToken 作为 Bearer 头）', () => {
    it('使用 accessToken 时不附加 ?key= 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({
        id: 'google-tts',
        apiKey: 'my-key',
        accessToken: 'oauth-token',
      })
      await adapter.synthesize({ text: 'Hello' })

      expect(fetchMock.calls[0].url).not.toContain('key=')
    })

    it('使用 accessToken 时设置 Authorization: Bearer 头', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({
        id: 'google-tts',
        accessToken: 'oauth-token',
      })
      await adapter.synthesize({ text: 'Hello' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer oauth-token')
    })
  })

  describe('synthesize', () => {
    it('POST /v1/text:synthesize 返回 audio Buffer + format', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const result = await adapter.synthesize({ text: 'Hello world' })

      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.format).toBe('mp3')

      // 验证 URL 包含 /v1/text:synthesize
      expect(fetchMock.calls[0].url).toContain('/v1/text:synthesize')
      expect(fetchMock.calls[0].opts.method).toBe('POST')
    })

    it('请求体包含 input/voice/audioConfig 三段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({ text: 'Test text' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.input).toBeDefined()
      expect(body.input.text).toBe('Test text')
      expect(body.voice).toBeDefined()
      expect(body.voice.languageCode).toBe('en-US')
      expect(body.voice.ssmlGender).toBe('NEUTRAL')
      expect(body.audioConfig).toBeDefined()
      expect(body.audioConfig.audioEncoding).toBe('MP3')
      expect(body.audioConfig.speakingRate).toBe(1.0)
    })

    it('支持 languageCode 参数覆盖默认值', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({ text: '你好', languageCode: 'zh-CN' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice.languageCode).toBe('zh-CN')
    })

    it('支持 ssmlGender 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({ text: 'Hi', ssmlGender: 'FEMALE' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice.ssmlGender).toBe('FEMALE')
    })

    it('支持 voiceName 参数覆盖 languageCode + ssmlGender', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({
        text: 'Hi',
        voiceName: 'en-US-Wavenet-D',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice.name).toBe('en-US-Wavenet-D')
    })

    it('支持 format 参数覆盖默认 audioEncoding', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const result = await adapter.synthesize({ text: 'Hi', format: 'WAV' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audioConfig.audioEncoding).toBe('WAV')
      expect(result.format).toBe('wav')
    })

    it('支持 speakingRate 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({ text: 'Hi', speakingRate: 1.5 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audioConfig.speakingRate).toBe(1.5)
    })

    it('支持 pitch 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await adapter.synthesize({ text: 'Hi', pitch: 2.0 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audioConfig.pitch).toBe(2.0)
    })

    it('无 text 参数抛错误', async () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await expect(adapter.synthesize({}))
        .rejects.toThrow(/text.*required/i)
    })

    it('空 text 抛错误', async () => {
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      await expect(adapter.synthesize({ text: '' }))
        .rejects.toThrow(/text.*required/i)
    })

    it('响应缺少 audioContent 字段 → ProviderError', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({}),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
        expect(e.message).toContain('audioContent')
      }
    })

    it('audioEncoding OGG_OPUS → format "ogg"', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ audioContent: MOCK_BASE64_AUDIO }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const result = await adapter.synthesize({ text: 'Hi', format: 'OGG_OPUS' })
      expect(result.format).toBe('ogg')
    })
  })

  describe('listVoices', () => {
    it('GET /v1/voices 返回声音列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          voices: [
            { name: 'en-US-Wavenet-D', languageCodes: ['en-US'], ssmlGender: 'MALE' },
            { name: 'en-US-Wavenet-A', languageCodes: ['en-US'], ssmlGender: 'FEMALE' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const voices = await adapter.listVoices()
      expect(voices).toHaveLength(2)
      expect(voices[0].name).toBe('en-US-Wavenet-D')
      expect(voices[0].ssmlGender).toBe('MALE')

      expect(fetchMock.calls[0].url).toContain('/v1/voices')
    })

    it('voices 为空时返回空数组', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({}),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const voices = await adapter.listVoices()
      expect(voices).toEqual([])
    })

    it('listVoices URL 包含 apiKey 查询参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ voices: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'my-key' })
      await adapter.listVoices()

      expect(fetchMock.calls[0].url).toContain('key=my-key')
      expect(fetchMock.calls[0].url).toContain('/v1/voices')
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（通过 listVoices 验证）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ voices: [{ name: 'v1' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(result.voices).toBe(1)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Bad key' } }, 401),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.AUTH_FAILED)
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ voices: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new GoogleTtsAdapter({
        id: 'google-tts-proxy',
        apiKey: 'key',
        baseUrl: 'https://my-proxy.com/google-tts',
      })
      await adapter.listVoices()

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('texttospeech.googleapis.com')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
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
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
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
        createFetchResponse({ error: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'bad' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.message).toContain('Invalid API key')
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ error: { message: 'Rate limited' } }, 429),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
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
        createFetchResponse({ error: { message: 'Internal error' } }, 500),
      ])
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
      try {
        await adapter.listVoices()
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
      const adapter = new GoogleTtsAdapter({ id: 'google-tts', apiKey: 'key' })
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
      const adapter = new GoogleTtsAdapter({
        id: 'google-tts',
        apiKey: 'key',
        baseUrl: 'https://texttospeech.googleapis.com',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('google-tts')
      expect(info.baseUrl).toBe('https://texttospeech.googleapis.com')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
