// @ts-check
/**
 * musicgen.test.js — MusicGen 本地服务 Adapter 测试
 *
 * 验证：构造、validateConfig（baseUrl 必填）、能力协商、generateMusic、testConnection（GET /health）、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { MusicGenAdapter } = require('./musicgen')
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

describe('MusicGenAdapter — MusicGen 本地服务', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new MusicGenAdapter({
        id: 'musicgen', baseUrl: 'http://localhost:5000',
      }, { timeout: 300000 })
      expect(adapter.id).toBe('musicgen')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:5000')
      expect(adapter.options.timeout).toBe(300000)
    })
    it('默认 baseUrl 为 localhost:5000', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:5000')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
    it('支持自定义 baseUrl', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen', baseUrl: 'http://gpu-server:5000' })
      expect(adapter.credentials.baseUrl).toBe('http://gpu-server:5000')
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen', baseUrl: 'http://localhost:5000' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 baseUrl 时返回 invalid', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })
  })

  describe('能力协商', () => {
    it('supports() 对 generateMusic 返回 false（不在 KNOWN_METHODS）', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      expect(adapter.supports('generateMusic')).toBe(false)
    })
    it('capabilities() 手动添加了 generateMusic', () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      const caps = adapter.capabilities()
      expect(caps).toContain('generateMusic')
      expect(caps).toContain('listModels')
      expect(caps).toContain('testConnection')
    })
  })

  describe('generateMusic', () => {
    it('POST /generate 返回 { audioUrl, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ ok: true })])
      global.fetch = fetchMock

      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      const result = await adapter.generateMusic({ prompt: '电子节拍' })

      expect(result.audioUrl).toBe('/output.wav')
      expect(result.model).toBe('musicgen')

      expect(fetchMock.calls[0].url).toBe('http://localhost:5000/generate')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('电子节拍')
      expect(body.model).toBe('musicgen')
    })

    it('自定义 model 和 duration', async () => {
      const fetchMock = createFetchMock([createFetchResponse({})])
      global.fetch = fetchMock
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      await adapter.generateMusic({ prompt: 'x', model: 'musicgen-large', duration: 60 })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.model).toBe('musicgen-large')
      expect(body.duration).toBe(60)
    })

    it('无 prompt 抛错', async () => {
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      await expect(adapter.generateMusic({})).rejects.toThrow(/prompt.*required/i)
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'srv' }, 500)])
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('testConnection', () => {
    it('GET /health 成功返回 true', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ status: 'ok' })])
      global.fetch = fetchMock
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(fetchMock.calls[0].url).toBe('http://localhost:5000/health')
    })
    it('连接失败返回 false', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new MusicGenAdapter({ id: 'musicgen' })
      try {
        await adapter.generateMusic({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
