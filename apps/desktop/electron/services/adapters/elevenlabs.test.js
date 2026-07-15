// @ts-check
/**
 * elevenlabs.test.js — P3.7 TDD: ElevenLabs TTS Adapter 测试
 *
 * 验证 ITtsAdapter mixin 的扩展性 — 第一个非 LLM 类别的 Adapter。
 *
 * ElevenLabs API 关键特性：
 * - 认证头 xi-api-key（非 Bearer / x-api-key）
 * - synthesize: POST /v1/text-to-speech/{voice_id} 返回 audio buffer
 * - listVoices: GET /v1/voices 返回 { voices: [{ voice_id, name, ... }] }
 * - listModels: GET /v1/models 返回 TTS 模型列表
 * - testConnection: 通过 listVoices 验证认证
 * - 不支持 LLM 方法（chatCompletion/streamChat/embeddings）
 * - synthesize 返回 { audio: ArrayBuffer, format: 'mp3', voice: voiceId }
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { ElevenLabsAdapter } = require('./elevenlabs')
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
      // 对于 audio 响应，返回模拟 buffer
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

describe('ElevenLabsAdapter — P3.7 第一个 TTS Adapter', () => {
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
      const adapter = new ElevenLabsAdapter({
        id: 'elevenlabs',
        apiKey: 'el-test-key',
        baseUrl: 'https://api.elevenlabs.io',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('elevenlabs')
      expect(adapter.credentials.apiKey).toBe('el-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.elevenlabs.io')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 ElevenLabs 官方端点', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.elevenlabs.io')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法（synthesize/listVoices）', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.supports('synthesize')).toBe(true)
      expect(adapter.supports('listVoices')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM 方法（chatCompletion/streamChat/embeddings）', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('streamChat')).toBe(false)
      expect(adapter.supports('embeddings')).toBe(false)
    })

    it('不支持 Image/Video 方法', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 TTS 相关方法', () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listVoices')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('认证头（关键差异：xi-api-key）', () => {
    it('请求头使用 xi-api-key', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ voices: [] }),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.listVoices()

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['xi-api-key']).toBe('el-test')
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('listVoices', () => {
    it('GET /v1/voices 返回声音列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          voices: [
            { voice_id: 'v1', name: 'Rachel' },
            { voice_id: 'v2', name: 'Domi' },
          ],
        }),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const voices = await adapter.listVoices()
      expect(voices).toHaveLength(2)
      expect(voices[0].voice_id).toBe('v1')
      expect(voices[0].name).toBe('Rachel')

      expect(fetchMock.calls[0].url).toContain('/v1/voices')
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: { message: 'Invalid API key' } }, 401),
      ])
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-bad' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw ProviderError')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: { message: 'Rate limited' } }, 429),
      ])
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })
  })

  describe('synthesize', () => {
    it('POST /v1/text-to-speech/{voice_id} 返回 audio buffer', async () => {
      const audioBuffer = new ArrayBuffer(16)
      const fetchMock = createFetchMock([
        createFetchResponse(audioBuffer, 200, { 'content-type': 'audio/mpeg' }),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = await adapter.synthesize({
        text: 'Hello world',
        voiceId: 'v1',
      })

      expect(result.audio).toBeInstanceOf(ArrayBuffer)
      expect(result.format).toBe('mp3')
      expect(result.voice).toBe('v1')

      // 验证 URL 包含 voice_id
      expect(fetchMock.calls[0].url).toContain('/v1/text-to-speech/v1')
    })

    it('支持 model 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        model: 'eleven_multilingual_v2',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model_id).toBe('eleven_multilingual_v2')
    })

    it('支持 voice_settings（stability/similarity_boost）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        stability: 0.5,
        similarityBoost: 0.75,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_settings).toBeDefined()
      expect(body.voice_settings.stability).toBe(0.5)
      expect(body.voice_settings.similarity_boost).toBe(0.75)
    })

    it('无 text 参数抛错误', async () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await expect(adapter.synthesize({ voiceId: 'v1' }))
        .rejects.toThrow(/text.*required/i)
    })

    it('无 voiceId 参数抛错误', async () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await expect(adapter.synthesize({ text: 'Hi' }))
        .rejects.toThrow(/voiceId.*required/i)
    })

    it('支持 outputFormat 参数（mp3_44100_128 vs pcm_24000）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        outputFormat: 'pcm_24000',
      })

      // outputFormat 作为 query parameter
      expect(fetchMock.calls[0].url).toContain('output_format=pcm_24000')
    })
  })

  describe('listModels', () => {
    it('GET /v1/models 返回 TTS 模型列表', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse([
          { model_id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
          { model_id: 'eleven_monolingual_v1', name: 'Monolingual v1' },
        ]),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(2)
      expect(models[0].model_id).toBe('eleven_multilingual_v2')
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true }（通过 listVoices 验证）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ voices: [{ voice_id: 'v1', name: 'Test' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(result.voices).toBe(1)
    })

    it('认证失败返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: { message: 'Bad key' } }, 401),
      ])
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-bad' })
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

      const adapter = new ElevenLabsAdapter({
        id: 'elevenlabs-proxy',
        apiKey: 'el-test',
        baseUrl: 'https://my-proxy.com/elevenlabs',
      })
      await adapter.listVoices()

      expect(fetchMock.calls[0].url).toContain('my-proxy.com')
      expect(fetchMock.calls[0].url).not.toContain('api.elevenlabs.io')
    })
  })

  describe('超时与网络错误', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
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
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new ElevenLabsAdapter({
        id: 'elevenlabs',
        apiKey: 'el-test',
        baseUrl: 'https://api.elevenlabs.io',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('elevenlabs')
      expect(info.baseUrl).toBe('https://api.elevenlabs.io')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })

  // ─── P3.7 质量节拍补跑：步骤② 边界场景补充 ───

  describe('audio format 推断（P3.7 补跑：AC7 split 逻辑）', () => {
    it('mp3_44100_128 → format "mp3"（默认）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        // 不传 outputFormat，使用默认 mp3_44100_128
      })

      expect(result.format).toBe('mp3')
      expect(fetchMock.calls[0].url).toContain('output_format=mp3_44100_128')
    })

    it('pcm_24000 → format "pcm"', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        outputFormat: 'pcm_24000',
      })

      expect(result.format).toBe('pcm')
    })

    it('ulaw_8000 → format "ulaw"', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      const result = await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        outputFormat: 'ulaw_8000',
      })

      expect(result.format).toBe('ulaw')
    })
  })

  describe('synthesize 边界（P3.7 补跑）', () => {
    it('voice_settings 只传 stability（similarityBoost 用默认 0.75）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        stability: 0.3,
        // 不传 similarityBoost
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_settings.stability).toBe(0.3)
      expect(body.voice_settings.similarity_boost).toBe(0.75)
    })

    it('voice_settings 只传 similarityBoost（stability 用默认 0.5）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
        similarityBoost: 0.9,
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_settings.stability).toBe(0.5)
      expect(body.voice_settings.similarity_boost).toBe(0.9)
    })

    it('不传 voice_settings 参数时不构造 voice_settings 字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(new ArrayBuffer(8), 200),
      ])
      global.fetch = fetchMock

      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await adapter.synthesize({
        text: 'Hi',
        voiceId: 'v1',
      })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_settings).toBeUndefined()
    })

    it('空 text 抛错误', async () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await expect(adapter.synthesize({ text: '', voiceId: 'v1' }))
        .rejects.toThrow(/text.*required/i)
    })

    it('空 voiceId 抛错误', async () => {
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      await expect(adapter.synthesize({ text: 'Hi', voiceId: '' }))
        .rejects.toThrow(/voiceId.*required/i)
    })
  })

  describe('错误响应边界（P3.7 补跑）', () => {
    it('detail 为字符串（非对象）→ 提取字符串消息', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: 'Plain string error message' }, 401),
      ])
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-bad' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.message).toContain('Plain string error message')
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: { message: 'Internal error' } }, 500),
      ])
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
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
      const adapter = new ElevenLabsAdapter({ id: 'elevenlabs', apiKey: 'el-test' })
      try {
        await adapter.listVoices()
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })
})
