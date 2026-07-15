// @ts-check
/**
 * music-library.test.js — 本地音乐库 Adapter 测试
 *
 * 验证：构造、validateConfig（baseUrl 必填）、能力协商、searchMusic、testConnection（GET /api/health）、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { MusicLibraryAdapter } = require('./music-library')
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

describe('MusicLibraryAdapter — 本地音乐库', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new MusicLibraryAdapter({
        id: 'music-library', baseUrl: 'http://localhost:3000',
      }, { timeout: 30000 })
      expect(adapter.id).toBe('music-library')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:3000')
      expect(adapter.options.timeout).toBe(30000)
    })
    it('默认 baseUrl 为 localhost:3000', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:3000')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
    it('支持自定义 baseUrl', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library', baseUrl: 'http://media-server:3000' })
      expect(adapter.credentials.baseUrl).toBe('http://media-server:3000')
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library', baseUrl: 'http://localhost:3000' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 baseUrl 时返回 invalid', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })
  })

  describe('能力协商', () => {
    it('supports() 对 searchMusic 返回 false（不在 KNOWN_METHODS）', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      expect(adapter.supports('searchMusic')).toBe(false)
    })
    it('capabilities() 手动添加了 searchMusic', () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      const caps = adapter.capabilities()
      expect(caps).toContain('searchMusic')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('searchMusic', () => {
    it('GET /api/music?keyword=xxx 返回 { tracks, total }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({
        total: 2,
        tracks: [
          { url: 'http://localhost:3000/files/song1.mp3', title: 'Song One', artist: 'Artist A' },
          { url: 'http://localhost:3000/files/song2.mp3', title: 'Song Two', artist: 'Artist B' },
        ],
      })])
      global.fetch = fetchMock

      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      const result = await adapter.searchMusic({ keyword: 'song' })

      expect(result.total).toBe(2)
      expect(result.tracks).toHaveLength(2)
      expect(result.tracks[0].url).toBe('http://localhost:3000/files/song1.mp3')
      expect(result.tracks[0].title).toBe('Song One')
      expect(result.tracks[0].artist).toBe('Artist A')

      expect(fetchMock.calls[0].url).toContain('/api/music')
      expect(fetchMock.calls[0].url).toContain('keyword=song')
    })

    it('无 keyword 抛错', async () => {
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      await expect(adapter.searchMusic({})).rejects.toThrow(/keyword.*required/i)
    })

    it('空结果返回空 tracks', async () => {
      global.fetch = createFetchMock([createFetchResponse({ total: 0, tracks: [] })])
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      const result = await adapter.searchMusic({ keyword: '不存在' })
      expect(result.tracks).toEqual([])
      expect(result.total).toBe(0)
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'srv' }, 500)])
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('testConnection', () => {
    it('GET /api/health 成功返回 true', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ status: 'ok' })])
      global.fetch = fetchMock
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(fetchMock.calls[0].url).toBe('http://localhost:3000/api/health')
    })
    it('连接失败返回 false', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MusicLibraryAdapter({ id: 'music-library' })
      try {
        await adapter.searchMusic({ keyword: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
