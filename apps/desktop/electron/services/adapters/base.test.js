// @ts-check
/**
 * base.test.js — P3.0 TDD: BaseAdapter 接口契约测试
 *
 * 验证：
 * - BaseAdapter 是抽象类，未实现方法抛 NotImplementedError
 * - supports(method) 能力协商
 * - capabilities() 返回支持的方法列表
 * - version 字段存在
 * - config 分离为 credentials + options
 */

import { describe, it, expect, vi } from 'vitest'

__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { BaseAdapter, NotImplementedError, ADAPTER_VERSION } = require('./base')

describe('BaseAdapter — P3.0 接口契约', () => {
  describe('ADAPTER_VERSION', () => {
    it('版本号存在且为整数', () => {
      expect(ADAPTER_VERSION).toBeDefined()
      expect(typeof ADAPTER_VERSION).toBe('number')
      expect(ADAPTER_VERSION).toBe(1)
    })
  })

  describe('NotImplementedError', () => {
    it('BaseAdapter 未实现的方法抛出 NotImplementedError', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(() => adapter.listModels()).toThrow(NotImplementedError)
    })

    it('NotImplementedError message 包含方法名', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      try {
        adapter.listModels()
      } catch (e) {
        expect(e.message).toContain('listModels')
      }
    })
  })

  describe('BaseAdapter 基础方法', () => {
    it('constructor 接受 credentials + options 分离参数', () => {
      const adapter = new BaseAdapter({
        id: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com',
      }, {
        timeout: 30000,
        maxRetries: 3,
      })
      expect(adapter.id).toBe('openai')
      expect(adapter.credentials.apiKey).toBe('sk-test')
      expect(adapter.options.timeout).toBe(30000)
    })

    it('getProviderInfo 返回基本信息', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      const info = adapter.getProviderInfo()
      expect(info.id).toBe('test')
      expect(info.version).toBe(ADAPTER_VERSION)
    })

    it('validateConfig 默认返回 { valid: true }', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })
  })

  describe('supports(method) 能力协商', () => {
    it('BaseAdapter 默认不支持任何高级方法', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(false)
      expect(adapter.supports('synthesize')).toBe(false)
      expect(adapter.supports('generateImage')).toBe(false)
    })

    it('子类通过覆盖方法自动获得 supports() === true', () => {
      class TestAdapter extends BaseAdapter {
        chatCompletion() { return 'ok' }
      }
      const adapter = new TestAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(adapter.supports('chatCompletion')).toBe(true)
      expect(adapter.supports('synthesize')).toBe(false)
    })
  })

  describe('capabilities() 返回支持的方法列表', () => {
    it('BaseAdapter 返回空数组', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(Array.isArray(caps)).toBe(true)
      expect(caps.length).toBe(0)
    })

    it('子类返回已实现的方法', () => {
      class TestAdapter extends BaseAdapter {
        chatCompletion() { return 'ok' }
        streamChat() { return 'ok' }
      }
      const adapter = new TestAdapter({ id: 'test', apiKey: 'sk-test' })
      const caps = adapter.capabilities()
      expect(caps).toContain('chatCompletion')
      expect(caps).toContain('streamChat')
    })
  })

  describe('接口隔离 — 4 类 mixin 方法', () => {
    it('LLM 方法（chatCompletion/streamChat/embeddings）默认抛 NotImplementedError', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(() => adapter.chatCompletion()).toThrow(NotImplementedError)
      expect(() => adapter.streamChat()).toThrow(NotImplementedError)
      expect(() => adapter.embeddings()).toThrow(NotImplementedError)
    })

    it('TTS 方法（synthesize/listVoices）默认抛 NotImplementedError', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(() => adapter.synthesize()).toThrow(NotImplementedError)
      expect(() => adapter.listVoices()).toThrow(NotImplementedError)
    })

    it('Image 方法（generateImage/editImage）默认抛 NotImplementedError', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(() => adapter.generateImage()).toThrow(NotImplementedError)
      expect(() => adapter.editImage()).toThrow(NotImplementedError)
    })

    it('Video 方法（generateVideo/getVideoStatus）默认抛 NotImplementedError', () => {
      const adapter = new BaseAdapter({ id: 'test', apiKey: 'sk-test' })
      expect(() => adapter.generateVideo()).toThrow(NotImplementedError)
      expect(() => adapter.getVideoStatus()).toThrow(NotImplementedError)
    })
  })
})
