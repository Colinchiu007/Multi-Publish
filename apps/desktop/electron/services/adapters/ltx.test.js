// @ts-check
/**
 * ltx.test.js — LTX Video 本地服务 Adapter 测试
 *
 * 验证：构造、validateConfig（baseUrl 必填）、能力协商、generateVideo（同步）、getVideoStatus（固定 completed）、testConnection（GET /health）、网络错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { LtxAdapter } = require('./ltx')
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

describe('LtxAdapter — LTX Video 本地服务', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  describe('构造与配置', () => {
    it('接受 credentials + options 分离参数', () => {
      const adapter = new LtxAdapter({
        id: 'ltx', baseUrl: 'http://localhost:8000',
      }, { timeout: 300000 })
      expect(adapter.id).toBe('ltx')
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8000')
      expect(adapter.options.timeout).toBe(300000)
    })
    it('默认 baseUrl 为 localhost:8000', () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      expect(adapter.credentials.baseUrl).toBe('http://localhost:8000')
    })
    it('版本号匹配 ADAPTER_VERSION', () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
    })
    it('支持自定义 baseUrl', () => {
      const adapter = new LtxAdapter({ id: 'ltx', baseUrl: 'http://192.168.1.100:9000' })
      expect(adapter.credentials.baseUrl).toBe('http://192.168.1.100:9000')
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl 时返回 valid', () => {
      const adapter = new LtxAdapter({ id: 'ltx', baseUrl: 'http://localhost:8000' })
      expect(adapter.validateConfig().valid).toBe(true)
    })
    it('无 baseUrl 时返回 invalid（显式置空）', () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      adapter.credentials.baseUrl = ''
      const result = adapter.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('baseUrl is required')
    })
  })

  describe('能力协商', () => {
    it('支持 generateVideo / getVideoStatus', () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      expect(adapter.supports('generateVideo')).toBe(true)
      expect(adapter.supports('getVideoStatus')).toBe(true)
      expect(adapter.capabilities()).toContain('generateVideo')
    })
  })

  describe('generateVideo（同步）', () => {
    it('POST /generate 返回 { videoUrl, model }', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ filename: 'out_001.mp4' })])
      global.fetch = fetchMock

      const adapter = new LtxAdapter({ id: 'ltx' })
      const result = await adapter.generateVideo({ prompt: '飞行的鸟' })

      expect(result.videoUrl).toBe('/outputs/out_001.mp4')
      expect(result.model).toBe('ltx')

      expect(fetchMock.calls[0].url).toBe('http://localhost:8000/generate')
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.prompt).toBe('飞行的鸟')
      expect(body.num_frames).toBe(24)
      expect(body.width).toBe(512)
      expect(body.height).toBe(512)
    })

    it('自定义 num_frames/width/height', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ filename: 'x.mp4' })])
      global.fetch = fetchMock
      const adapter = new LtxAdapter({ id: 'ltx' })
      await adapter.generateVideo({ prompt: 'x', num_frames: 48, width: 768, height: 768 })
      const body = JSON.parse(fetchMock.calls[0].opts.body)
      expect(body.num_frames).toBe(48)
      expect(body.width).toBe(768)
      expect(body.height).toBe(768)
    })

    it('无 prompt 抛错', async () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      await expect(adapter.generateVideo({})).rejects.toThrow(/prompt.*required/i)
    })

    it('500 → PROVIDER_ERROR', async () => {
      global.fetch = createFetchMock([createFetchResponse({ error: 'srv' }, 500)])
      const adapter = new LtxAdapter({ id: 'ltx' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      }
    })
  })

  describe('getVideoStatus（同步模式）', () => {
    it('固定返回 { status: completed }', async () => {
      const adapter = new LtxAdapter({ id: 'ltx' })
      const result = await adapter.getVideoStatus('any')
      expect(result.status).toBe('completed')
      expect(result.progress).toBe(100)
    })
  })

  describe('testConnection', () => {
    it('GET /health 成功返回 true', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ status: 'ok' })])
      global.fetch = fetchMock
      const adapter = new LtxAdapter({ id: 'ltx' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(true)
      expect(fetchMock.calls[0].url).toBe('http://localhost:8000/health')
    })
    it('连接失败返回 false', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new LtxAdapter({ id: 'ltx' })
      const result = await adapter.testConnection()
      expect(result.success).toBe(false)
    })
  })

  describe('网络错误分类', () => {
    it('ETIMEDOUT → TIMEOUT', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ETIMEDOUT') })
      const adapter = new LtxAdapter({ id: 'ltx' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.TIMEOUT)
      }
    })
    it('ECONNREFUSED → NETWORK_ERROR', async () => {
      global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
      const adapter = new LtxAdapter({ id: 'ltx' })
      try {
        await adapter.generateVideo({ prompt: 'x' })
        expect.fail('Should throw')
      } catch (e) {
        expect(e.code).toBe(ERROR_CODES.NETWORK_ERROR)
      }
    })
  })
})
