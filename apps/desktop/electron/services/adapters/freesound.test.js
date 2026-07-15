// @ts-check
/**
 * freesound.test.js — Freesound 音效搜索 Adapter 测试
 *
 * 验证：构造、validateConfig、能力协商（searchMusic 自定义方法）、searchMusic、错误处理、testConnection、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { FreesoundAdapter } = require('./freesound')
const { ProviderError, ERROR_CODES } = require('./provider-error')
const { ADAPTER_VERSION } = require('./base')

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

describe('FreesoundAdapter — Freesound 音效搜索', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new FreesoundAdapter({
        id: 'freesound', apiKey: 'fs-token', baseUrl: 'https://freesound.org/apiv2',
      }, { timeout: 30000 })
      expect(adapter.id).toBe('freesound')
      expect(adapter.credentials.apiKey).toBe('fs-token')
      expect(adapter.options.timeout).toBe(30000)
    })
    it('默认 baseUrl', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      expect(adapter.credentials.baseUrl).toBe('https://freesound.org/apiv2')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
  })

  describe('validateConfig', () => {
    it('有 apiKey 时返回 valid', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 apiKey 时返回 invalid', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: '' })
      expect(adapter.validateConfig().valid).toBe(false)
    })
  })

  describe('能力协商', () => {
    it('supports() 对 searchMusic 返回 false（不在 KNOWN_METHODS）', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      expect(adapter.supports('searchMusic')).toBe(false)
    })
    it('capabilities() 手动添加了 searchMusic', () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      const caps = adapter.capabilities()
      expect(caps).toContain('searchMusic')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('searchMusic', () => {
    it('GET /search/text/?query=keyword&token=xxx 返回 { tracks, total }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        count: 2,
        results: [
          {
            name: 'rain sound',
            duration: 60,
            previews: { 'preview-hq-mp3': 'https://freesound.org/previews/rain.mp3' },
          },
          {
            name: 'thunder',
            duration: 30,
            previews: { 'preview-hq-mp3': 'https://freesound.org/previews/thunder.mp3' },
          },
        ],
      })])
      global.fetch = fetchMock

      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'fs-token' })
      const result = await adapter.searchMusic({ keyword: 'rain' })

      expect(result.total).toBe(2)
      expect(result.tracks).toHaveLength(2)
      expect(result.tracks[0].url).toBe('https://freesound.org/previews/rain.mp3')
      expect(result.tracks[0].name).toBe('rain sound')
      expect(result.tracks[0].duration).toBe(60)

      // 验证 URL 含 token 和 query
      const url = fetchMock.calls[0].url
      expect(url).toContain('/search/text/')
      expect(url).toContain('token=fs-token')
      expect(url).toContain('query=rain')
    })

    it('无 keyword 抛错', async () => {
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      await expect(adapter.searchMusic({})).rejects.toThrow(/keyword.*required/i)
    })

    it('空结果返回空 tracks', async () => {
      global.fetch = createFetchMock([createFetchResponse({ count: 0, results: [] })])
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      const result = await adapter.searchMusic({ keyword: '不存在' })
      expect(result.tracks).toEqual([])
      expect(result.total).toBe(0)
    })

    it('401 → AUTH_FAILED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ detail: 'Bad token' }, 401)])
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'bad' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
    })

    it('429 → RATE_LIMITED', async () => {
      global.fetch = createFetchMock([createFetchResponse({ detail: 'rate' }, 429)])
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.RATE_LIMITED)
      }
    })
  })

  describe('testConnection', () => {
    it('GET /me?token=xxx 成功返回 true', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ username: 'tester' })])
      global.fetch = fetchMock
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(fetchMock.calls[0].url).toContain('/me')
      expect(fetchMock.calls[0].url).toContain('token=k')
    })
    it('401 返回 false', async () => {
      global.fetch = createFetchMock([createFetchResponse({ detail: 'Bad' }, 401)])
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'bad' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new FreesoundAdapter({ id: 'freesound', apiKey: 'k' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
