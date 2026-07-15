// @ts-check
/**
 * minimax-tts.test.js — TDD: MiniMax TTS Adapter 测试
 *
 * MiniMax TTS API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - synthesize: POST /t2a_v2，请求体 { model, text, voice_setting, audio_setting }
 * - 响应中 data.audio 为 hex 编码字符串，需转换为 Buffer
 * - 支持 speed（0.5-2，默认 1.0）和 pitch（默认 0）
 * - 支持 mp3/wav/flac 格式
 * - listModels: 静态返回 4 个模型
 * - testConnection: 验证 apiKey 存在
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { MinimaxTtsAdapter, MINIMAX_TTS_MODELS } = require('./minimax-tts')
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

// hex 编码的"Hello"测试数据
const HEX_AUDIO = '48656c6c6f'

describe('MinimaxTtsAdapter — MiniMax TTS Adapter', () => {
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
      const adapter = new MinimaxTtsAdapter({
        id: 'minimax-tts',
        apiKey: 'mm-test-key',
        baseUrl: 'https://api.minimaxi.com/v1',
      }, {
        timeout: 30000,
        maxRetries: 2,
      })
      expect(adapter.id).toBe('minimax-tts')
      expect(adapter.credentials.apiKey).toBe('mm-test-key')
      expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('默认 baseUrl 为 MiniMax 官方端点', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('无 apiKey 时返回 invalid + errors', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: '' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('apiKey is required')
    })
  })

  describe('能力协商', () => {
    it('支持 TTS 方法 synthesize', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      expect(adapter.supports('synthesize')).toBe(true)
    })

    it('支持 listModels 和 testConnection', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      expect(adapter.supports('listModels')).toBe(true)
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('不支持 LLM/Image/Video 方法', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
      expect(adapter.supports('generateVideo')).toBe(false)
    })

    it('capabilities() 返回 TTS 相关方法', () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('synthesize')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
      expect(caps).not.toContain('chatCompletion')
    })
  })

  describe('认证头（Bearer 模式）', () => {
    it('请求头使用 Authorization Bearer', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: 'Hello' })

      const headers = fetchMock.calls[0].opts.headers
      expect(headers['Authorization']).toBe('Bearer mm-test')
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('synthesize', () => {
    it('POST /t2a_v2 返回 Buffer 音频（hex 转 Buffer）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      const result = await adapter.synthesize({
        text: 'Hello world',
        voice: 'male-qn-qingse',
      })

      expect(result.audio).toBeInstanceOf(Buffer)
      // hex "48656c6c6f" → "Hello"
      expect(result.audio.toString('utf8')).toBe('Hello')
      expect(result.format).toBe('mp3')

      // 验证 URL 包含 /t2a_v2
      expect(fetchMock.calls[0].url).toContain('/t2a_v2')
    })

    it('text 参数映射到 body.text', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: '你好世界' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.text).toBe('你好世界')
    })

    it('voice 参数映射到 voice_setting.voice_id', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: 'Hi', voice: 'female-shaonv' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_setting.voice_id).toBe('female-shaonv')
    })

    it('speed/pitch 参数映射到 voice_setting', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: 'Hi', speed: 1.5, pitch: 5 })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_setting.speed).toBe(1.5)
      expect(body.voice_setting.pitch).toBe(5)
    })

    it('默认 speed=1.0，pitch=0', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: 'Hi' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.voice_setting.speed).toBe(1.0)
      expect(body.voice_setting.pitch).toBe(0)
    })

    it('outputFormat 映射到 audio_setting.format', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: { audio: HEX_AUDIO } }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.synthesize({ text: 'Hi', outputFormat: 'wav' })

      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.audio_setting.format).toBe('wav')
      expect(body.audio_setting.sample_rate).toBe(32000)
    })

    it('无 text 参数抛错误', async () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await expect(adapter.synthesize({ voice: 'v1' }))
        .rejects.toThrow(/text.*required/i)
    })

    it('响应缺少 audio data → ProviderError(PROVIDER_ERROR)', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ data: {} }),
      ])
      global.fetch = fetchMock

      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })

    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ base_resp: { status_msg: 'Invalid API key' } }, 401),
      ])
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-bad' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('网络错误 → ProviderError(NETWORK_ERROR)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      try {
        await adapter.synthesize({ text: 'Hi' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })

  describe('listModels', () => {
    it('返回静态预定义的 MiniMax TTS 模型列表（4 个）', async () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(4)
      const ids = models.map(m => m.id)
      expect(ids).toContain('speech-2.8-hd')
      expect(ids).toContain('speech-2.8-turbo')
      expect(ids).toContain('speech-2.6-hd')
      expect(ids).toContain('speech-2.6-turbo')
    })

    it('不发起 HTTP 请求（静态列表）', async () => {
      const fetchMock = createFetchMock([])
      global.fetch = fetchMock
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      await adapter.listModels()
      expect(fetchMock.calls).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('apiKey 存在时返回 { success: true }', async () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: 'mm-test' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })

    it('apiKey 缺失时返回 { success: false, error }', async () => {
      const adapter = new MinimaxTtsAdapter({ id: 'minimax-tts', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_CONFIG)
    })
  })
})
