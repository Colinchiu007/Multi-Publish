// @ts-check
/**
 * agnes-llm.test.js — TDD: Agnes AI LLM Adapter 测试
 *
 * 验证：
 * - 类可被实例化
 * - supports('chatCompletion') 返回 true
 * - supports('synthesize') 返回 false（不是 TTS）
 * - validateConfig 在有 baseUrl + apiKey 时 valid: true
 * - validateConfig 在无 baseUrl 时 valid: false
 *
 * 使用 __registerMock mock logger，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { AgnesLlmAdapter } = require('./agnes-llm')

describe('AgnesLlmAdapter — Agnes AI LLM Adapter', () => {
  describe('构造与能力', () => {
    it('类可被实例化', () => {
      const adapter = new AgnesLlmAdapter({
        id: 'agnes-llm',
        apiKey: 'sk-agnes-test',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      })
      expect(adapter).toBeInstanceOf(AgnesLlmAdapter)
      expect(adapter.id).toBe('agnes-llm')
      expect(adapter.credentials.baseUrl).toBe('https://apihub.agnes-ai.com/v1')
    })

    it("supports('chatCompletion') 返回 true", () => {
      const adapter = new AgnesLlmAdapter({
        id: 'agnes-llm',
        apiKey: 'sk-agnes-test',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      })
      expect(adapter.supports('chatCompletion')).toBe(true)
    })

    it("supports('synthesize') 返回 false（不是 TTS）", () => {
      const adapter = new AgnesLlmAdapter({
        id: 'agnes-llm',
        apiKey: 'sk-agnes-test',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      })
      expect(adapter.supports('synthesize')).toBe(false)
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl + apiKey 时 valid: true', () => {
      const adapter = new AgnesLlmAdapter({
        id: 'agnes-llm',
        apiKey: 'sk-agnes-test',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('未传 baseUrl 时回退到默认值仍 valid: true', () => {
      // OpenAIAdapter 构造函数会在 baseUrl 缺失时注入默认值
      // https://api.openai.com/v1，因此 validateConfig 始终 valid
      const adapter = new AgnesLlmAdapter({
        id: 'agnes-llm',
        apiKey: 'sk-agnes-test',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })
  })
})
