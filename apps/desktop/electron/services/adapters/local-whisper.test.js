// @ts-check
/**
 * local-whisper.test.js — 本地 Whisper 语音识别 Adapter 测试
 *
 * 本地 Whisper HTTP 服务关键特性：
 * - 无需认证（baseUrl 必填，apiKey 可选）
 * - baseUrl 默认 http://localhost:8080（可配置）
 * - transcribe: POST /asr 或 /transcribe（FormData 上传音频）
 * - testConnection: GET /models 检查服务是否在线
 * - validateConfig: baseUrl 必填，apiKey 可选
 *
 * 验证维度：
 * - 构造与配置（默认 baseUrl、默认 maxRetries=0、版本号）
 * - validateConfig（baseUrl 必填，apiKey 可选）
 * - capabilities 包含 'transcribe' + 'listModels'（手动添加 transcribe）
 * - transcribe 成功调用（验证 URL、FormData、不设 Content-Type）
 * - 支持 endpoint='asr' 和 'transcribe' 两种模式
 * - 错误处理（401/429/500 → ProviderError）
 * - testConnection（成功/失败）
 * - 网络错误分类（TIMEOUT / NETWORK_ERROR，本地 ECONNREFUSED 关键场景）
 *
 * 使用 fetch mock，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { LocalWhisperAdapter } = require('./local-whisper')
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

describe('LocalWhisperAdapter — 本地 Whisper 语音识别', () => {
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
      const adapter = new LocalWhisperAdapter({
        id: 'local-whisper',
        baseUrl: 'http://localhost:9000',
      }, {
        timeout: 60000,
        maxRetries: 1,
      })
      expect(adapter.id).toBe('local-whisper')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:9000')
      expect(adapter.options.timeout).toBe(60000)
      expect(adapter.options.maxRetries).toBe(1)
    })

    it('默认 baseUrl 为 http://localhost:8080', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8080')
    })

    it('默认 maxRetries 为 0（本地服务不重试）', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.options.maxRetries).toBe(0)
    })

    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })

    it('apiKey 可选（不传时不报错）', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.credentials.apiKey).toBeUndefined()
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper', baseUrl: 'http://localhost:8080' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('baseUrl 始终被构造函数填充默认值（不会为空）', () => {
      // 构造函数中 this.credentials.baseUrl || DEFAULT_BASE_URL 保证非空
      // 即使传空字符串，也会回退到 http://localhost:8080
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper', baseUrl: '' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8080')
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('apiKey 不要求（可选）', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper', baseUrl: 'http://localhost:8080' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })
  })

  describe('能力协商', () => {
    it('支持 testConnection', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.supports('testConnection')).toBe(true)
    })

    it('支持 listModels（GET /models）', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.supports('listModels')).toBe(true)
    })

    it('不支持 LLM/TTS/Image/Video 方法', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })

    it('capabilities() 包含 transcribe（手动添加）', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const caps = adapter.capabilities()
      expect(caps).toContain('transcribe')
      expect(caps).toContain('testConnection')
      expect(caps).toContain('listModels')
      expect(caps).not.toContain('chatCompletion')
    })

    it('supports("transcribe") 因不在 KNOWN_METHODS 中返回 false', () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      expect(adapter.supports('transcribe')).toBe(false)
    })
  })

  describe('transcribe — FormData 上传音频', () => {
    it('POST /asr（默认端点）返回识别结果', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hello world' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.transcribe({
        audio: Buffer.from('fake-audio-bytes'),
      })

      expect(result.text).toBe('hello world')
      expect(result.language).toBe('auto')
      expect(result.duration).toBe(0)

      expect(fetchMock.calls[0].url).toContain('/asr')
    })

    it('请求体为 FormData（包含 audio_file 字段）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      await adapter.transcribe({
        audio: Buffer.from('audio-data'),
        filename: 'test.wav',
        model: 'small',
      })

      const body = fetchMock.calls[0].opts.body
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('audio_file')).not.toBeNull()
      expect(body.get('model')).toBe('small')
    })

    it('endpoint="transcribe" 时使用 /transcribe 路径和 file 字段', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      await adapter.transcribe({
        audio: Buffer.from('data'),
        endpoint: 'transcribe',
      })

      expect(fetchMock.calls[0].url).toContain('/transcribe')
      const body = fetchMock.calls[0].opts.body
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('file')).not.toBeNull()
      expect(body.get('audio_file')).toBeNull()
    })

    it('支持 language 参数', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: '你好' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.transcribe({
        audio: Buffer.from('data'),
        language: 'zh',
      })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('language')).toBe('zh')
      expect(result.language).toBe('zh')
    })

    it('支持默认 model=base', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      await adapter.transcribe({ audio: Buffer.from('data') })

      const body = fetchMock.calls[0].opts.body
      expect(body.get('model')).toBe('base')
    })

    it('无 audio 参数抛 INVALID_CONFIG', async () => {
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({})
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.INVALID_CONFIG)
      }
    })

    it('接受 Uint8Array 类型音频', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.transcribe({
        audio: new Uint8Array([1, 2, 3, 4]),
      })

      expect(result.text).toBe('hi')
      expect(fetchMock.calls[0].opts.body).toBeInstanceOf(FormData)
    })

    it('接受 ArrayBuffer 类型音频', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      await adapter.transcribe({
        audio: new ArrayBuffer(8),
      })

      expect(fetchMock.calls[0].opts.body).toBeInstanceOf(FormData)
    })

    it('纯文本响应（非 JSON）也能解析', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse('plain text result', 200, { 'content-type': 'text/plain' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.transcribe({ audio: Buffer.from('data') })

      expect(result.text).toBe('plain text result')
    })

    it('JSON 响应含 segments 时提取 duration', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({
          text: 'hello',
          segments: [
            { id: 0, start: 0, end: 2.5 },
            { id: 1, start: 2.5, end: 5.0 },
          ],
        }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.transcribe({ audio: Buffer.from('data') })

      expect(result.text).toBe('hello')
      expect(result.duration).toBe(5.0)
    })
  })

  describe('认证（可选 apiKey）', () => {
    it('未配置 apiKey 时请求头不含 Authorization', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      await adapter.transcribe({ audio: Buffer.from('data') })

      expect(fetchMock.calls[0].opts.headers['Authorization']).toBeUndefined()
    })

    it('配置 apiKey 时请求头含 Authorization: Bearer xxx', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({
        id: 'local-whisper',
        apiKey: 'proxy-secret',
      })
      await adapter.transcribe({ audio: Buffer.from('data') })

      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer proxy-secret')
    })
  })

  describe('listModels', () => {
    it('GET /models 返回模型列表（字符串数组格式）', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(['tiny', 'base', 'small', 'medium', 'large']),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(5)
      expect(models[0]).toBe('tiny')
      expect(fetchMock.calls[0].url).toContain('/models')
    })

    it('GET /models 返回 { models: [...] } 格式也能解析', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ models: [{ id: 'base', name: 'Base' }] }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const models = await adapter.listModels()
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('base')
    })

    it('非数组响应返回空数组', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ unrelated: 'data' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const models = await adapter.listModels()
      expect(models).toEqual([])
    })
  })

  describe('testConnection', () => {
    it('成功返回 { success: true, models }', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse(['base', 'small']),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(result.models).toBe(2)
    })

    it('服务离线（ECONNREFUSED）返回 { success: false, error }', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })

    it('500 错误返回 { success: false, error }', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: 'Internal error' }, 500),
      ])
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(ProviderError)
      expect(result.error.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })
  })

  describe('错误处理', () => {
    it('401 错误 → ProviderError(AUTH_FAILED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: 'Unauthorized' }, 401),
      ])
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper', apiKey: 'bad' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
        expect(e.retryable).toBe(false)
      }
    })

    it('429 错误 → ProviderError(RATE_LIMITED)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: 'Too many requests' }, 429),
      ])
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
        expect(e.retryable).toBe(true)
      }
    })

    it('500 错误 → ProviderError(PROVIDER_ERROR)', async () => {
      global.fetch = createFetchMock([
        createFetchResponse({ detail: 'Internal error' }, 500),
      ])
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
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
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('网络错误分类', () => {
    it('fetch 超时 → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
        expect(e.retryable).toBe(true)
      }
    })

    it('ECONNREFUSED → ProviderError(NETWORK_ERROR)（本地服务离线关键场景）', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED 127.0.0.1:8080') })
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
        expect(e.retryable).toBe(true)
      }
    })

    it('aborted → ProviderError(TIMEOUT)', async () => {
      global.fetch = vi.fn(async () => { throw new Error('The operation was aborted') })
      const adapter = new LocalWhisperAdapter({ id: 'local-whisper' })
      try {
        await adapter.transcribe({ audio: Buffer.from('data') })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
  })

  describe('baseUrl 自定义', () => {
    it('自定义 baseUrl 用于请求', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({
        id: 'local-whisper-remote',
        baseUrl: 'http://192.168.1.100:9000',
      })
      await adapter.transcribe({ audio: Buffer.from('data') })

      expect(fetchMock.calls[0].url).toContain('192.168.1.100:9000')
      expect(fetchMock.calls[0].url).not.toContain('localhost:8080')
    })

    it('baseUrl 末尾斜杠被正确处理', async () => {
      const fetchMock = createFetchMock([
        createFetchResponse({ text: 'hi' }, 200, { 'content-type': 'application/json' }),
      ])
      global.fetch = fetchMock

      const adapter = new LocalWhisperAdapter({
        id: 'local-whisper',
        baseUrl: 'http://localhost:8080/',
      })
      await adapter.transcribe({ audio: Buffer.from('data') })

      // 不应出现双斜杠
      expect(fetchMock.calls[0].url).not.toContain('//asr')
      expect(fetchMock.calls[0].url).toContain('localhost:8080/asr')
    })
  })

  describe('getProviderInfo', () => {
    it('返回 id + baseUrl + version', () => {
      const adapter = new LocalWhisperAdapter({
        id: 'local-whisper',
        baseUrl: 'http://localhost:8080',
      })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('local-whisper')
      expect(info.baseUrl).toBe('http://localhost:8080')
      expect(info.version).toBe(ADAPTER_VERSION)
    })
  })
})
