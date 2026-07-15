// @ts-check
/**
 * suno.test.js — Suno 音乐生成 Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商（generateMusic 自定义方法）、generateMusic、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { SunoAdapter } = require('./suno')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { ADAPTER_VERSION } = require('./_base/base')

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

describe('SunoAdapter — Suno 音乐生成', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new SunoAdapter({
        id: 'suno', apiKey: 'suno-key', baseUrl: 'https://api.suno.ai/v1',
      }, { timeout: 120000 })
      expect(adapter.id).toBe('suno')
      expect(adapter.credentials.apiKey).toBe('suno-key')
      expect(adapter.options.timeout).toBe(120000)
    })
    it('默认 baseUrl', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://api.suno.ai/v1')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('supports() 对 generateMusic 返回 false（不在 KNOWN_METHODS）', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      // generateMusic 不在 KNOWN_METHODS 中，supports() 检测不到
      expect(adapter.supports('generateMusic')).toBe(false)
    })
    it('capabilities() 手动添加了 generateMusic', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateMusic')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
    it('不支持 generateVideo（视频方法）', () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      expect(adapter.supports('generateVideo')).toBe(false)
    })
  })

  describe('generateMusic', () => {
    it('POST /music/generations 返回 { audioUrl, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        audio_url: 'https://cdn.suno.com/audio/123.mp3',
      })])
      global.fetch = fetchMock

      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      const result = await adapter.generateMusic({ prompt: '欢快的钢琴曲' })

      expect(result.audioUrl).toBe('https://cdn.suno.com/audio/123.mp3')
      expect(result.model).toBe('suno-v4')

      expect(fetchMock.calls[0].url).toContain('/music/generations')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('欢快的钢琴曲')
      expect(body.model).toBe('suno-v4')
      expect(fetchMock.calls[0].opts.headers['Authorization']).toBe('Bearer k')
    })

    it('自定义 model 和 duration', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ audio_url: 'https://x/a.mp3' })])
      global.fetch = fetchMock
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      await adapter.generateMusic({ prompt: 'x', model: 'suno-v3.5', duration: 30 })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('suno-v3.5')
      expect(body.duration).toBe(30)
    })

    it('无 prompt 抛错', async () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      await expect(adapter.generateMusic({})).rejects.toThrow(/prompt.*required/i)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'Bad key' } }, 401)])
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'bad' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'rate' } }, 429)])
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: { message: 'srv' } }, 500)])
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('testConnection', () => {
    it('请求成功返回 true', async () => {
      global.fetch = createFetchMock([createFetchResponse({ audio_url: 'https://x/a.mp3' })])
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
    })
    it('配置无效返回 false', async () => {
      const adapter = new SunoAdapter({ id: 'suno', apiKey: '' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new SunoAdapter({ id: 'suno', apiKey: 'k' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
