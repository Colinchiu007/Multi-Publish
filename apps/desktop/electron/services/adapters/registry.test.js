// @ts-check
/**
 * registry.test.js — P3.0 TDD: AdapterRegistry 注册表测试
 *
 * 验证：
 * - 注册 Adapter → 可获取
 * - 重复注册同 ID → 抛错含已注册路径
 * - 获取未注册 → undefined
 * - registerAdapter 自动调用 validateConfig
 * - 接口版本号检查
 * - listAdapters / unregister
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { AdapterRegistry } = require('./registry')
const { BaseAdapter, ADAPTER_VERSION } = require('./base')

// 创建测试用 Adapter
class TestLlmAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this._validated = false
  }
  validateConfig() {
    this._validated = true
    return { valid: true }
  }
  chatCompletion() { return 'chat result' }
  listModels() { return ['gpt-4o'] }
}

class TestTtsAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
  }
  synthesize() { return 'audio buffer' }
  listVoices() { return ['alloy', 'echo'] }
}

describe('AdapterRegistry — P3.0 注册表', () => {
  let registry

  beforeEach(() => {
    registry = new AdapterRegistry()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('registerAdapter / getAdapter', () => {
    it('注册 Adapter 后可获取', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      registry.registerAdapter('openai', adapter)
      const retrieved = registry.getAdapter('openai')
      expect(retrieved).toBe(adapter)
    })

    it('获取未注册的 Adapter 返回 undefined', () => {
      const result = registry.getAdapter('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('重复注册检测', () => {
    it('重复注册同 ID 抛错', () => {
      const adapter1 = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      const adapter2 = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-other' })
      registry.registerAdapter('openai', adapter1)
      expect(() => registry.registerAdapter('openai', adapter2)).toThrow(/already registered/i)
    })

    it('重复注册错误消息包含已注册 Adapter 信息', () => {
      const adapter1 = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      const adapter2 = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-other' })
      registry.registerAdapter('openai', adapter1)
      try {
        registry.registerAdapter('openai', adapter2)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e.message).toContain('openai')
        expect(e.message).toContain('already registered')
      }
    })
  })

  describe('validateConfig 自动调用', () => {
    it('注册时自动调用 adapter.validateConfig()', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      const spy = vi.spyOn(adapter, 'validateConfig')
      registry.registerAdapter('openai', adapter)
      expect(spy).toHaveBeenCalledOnce()
    })

    it('validateConfig 返回 invalid 时不注册', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      adapter.validateConfig = vi.fn(() => ({ valid: false, errors: ['Missing API key'] }))
      expect(() => registry.registerAdapter('openai', adapter)).toThrow(/invalid config/i)
      expect(registry.getAdapter('openai')).toBeUndefined()
    })
  })

  describe('接口版本号检查', () => {
    it('注册时检查 adapter.version 匹配 ADAPTER_VERSION', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      expect(adapter.version).toBe(ADAPTER_VERSION)
      registry.registerAdapter('openai', adapter)
      expect(registry.getAdapter('openai')).toBeDefined()
    })

    it('版本不匹配时抛错', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      Object.defineProperty(adapter, 'version', { value: 99, writable: true })
      expect(() => registry.registerAdapter('openai', adapter)).toThrow(/version mismatch/i)
    })
  })

  describe('listAdapters', () => {
    it('返回所有已注册 Adapter', () => {
      const llm = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      const tts = new TestTtsAdapter({ id: 'elevenlabs', apiKey: 'sk-test' })
      registry.registerAdapter('openai', llm)
      registry.registerAdapter('elevenlabs', tts)
      const list = registry.listAdapters()
      expect(list).toHaveLength(2)
      expect(list.map(a => a.id).sort()).toEqual(['elevenlabs', 'openai'])
    })

    it('空注册表返回空数组', () => {
      expect(registry.listAdapters()).toEqual([])
    })
  })

  describe('unregister', () => {
    it('注销已注册的 Adapter', () => {
      const adapter = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      registry.registerAdapter('openai', adapter)
      registry.unregister('openai')
      expect(registry.getAdapter('openai')).toBeUndefined()
    })

    it('注销不存在的 Adapter 不抛错', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow()
    })
  })

  describe('getAdaptersByCategory', () => {
    it('按类别过滤 Adapter', () => {
      const llm = new TestLlmAdapter({ id: 'openai', apiKey: 'sk-test' })
      const tts = new TestTtsAdapter({ id: 'elevenlabs', apiKey: 'sk-test' })
      registry.registerAdapter('openai', llm)
      registry.registerAdapter('elevenlabs', tts)

      const llmAdapters = registry.getAdaptersByCapability('chatCompletion')
      expect(llmAdapters).toHaveLength(1)
      expect(llmAdapters[0].id).toBe('openai')

      const ttsAdapters = registry.getAdaptersByCapability('synthesize')
      expect(ttsAdapters).toHaveLength(1)
      expect(ttsAdapters[0].id).toBe('elevenlabs')
    })
  })
})
