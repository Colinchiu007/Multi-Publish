// @ts-check
/**
 * tianyiyun-coding-plan.test.js — TDD: 天翼云 Coding Plan LLM Adapter 测试
 *
 * 验证：
 * - 类可被实例化
 * - supports('chatCompletion') 返回 true
 * - supports('synthesize') 返回 false（不是 TTS）
 * - validateConfig 在有 baseUrl + apiKey 时 valid: true
 * - validateConfig 在无 baseUrl 时回退默认仍 valid: true（OpenAIAdapter 基类行为）
 *
 * 使用 __registerMock mock logger，不发起真实 HTTP 请求
 */

import { describe, it, expect, vi } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { TianyiYunCodingPlanAdapter } = require('./tianyiyun-coding-plan')

describe('TianyiYunCodingPlanAdapter — 天翼云 Coding Plan LLM Adapter', () => {
  describe('构造与能力', () => {
    it('类可被实例化', () => {
      const adapter = new TianyiYunCodingPlanAdapter({
        id: 'tianyiyun-coding-plan',
        apiKey: 'sk-tianyi-test',
        baseUrl: 'https://eaichat.ctyun.cn/ai/platform/v2/cp',
      })
      expect(adapter).toBeInstanceOf(TianyiYunCodingPlanAdapter)
      expect(adapter.id).toBe('tianyiyun-coding-plan')
      expect(adapter.credentials.baseUrl).toBe('https://eaichat.ctyun.cn/ai/platform/v2/cp')
    })

    it("supports('chatCompletion') 返回 true", () => {
      const adapter = new TianyiYunCodingPlanAdapter({
        id: 'tianyiyun-coding-plan',
        apiKey: 'sk-tianyi-test',
        baseUrl: 'https://eaichat.ctyun.cn/ai/platform/v2/cp',
      })
      expect(adapter.supports('chatCompletion')).toBe(true)
    })

    it("supports('synthesize') 返回 false（不是 TTS）", () => {
      const adapter = new TianyiYunCodingPlanAdapter({
        id: 'tianyiyun-coding-plan',
        apiKey: 'sk-tianyi-test',
        baseUrl: 'https://eaichat.ctyun.cn/ai/platform/v2/cp',
      })
      expect(adapter.supports('synthesize')).toBe(false)
    })
  })

  describe('validateConfig', () => {
    it('有 baseUrl + apiKey 时 valid: true', () => {
      const adapter = new TianyiYunCodingPlanAdapter({
        id: 'tianyiyun-coding-plan',
        apiKey: 'sk-tianyi-test',
        baseUrl: 'https://eaichat.ctyun.cn/ai/platform/v2/cp',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
    })

    it('未传 baseUrl 时回退到默认值仍 valid: true', () => {
      const adapter = new TianyiYunCodingPlanAdapter({
        id: 'tianyiyun-coding-plan',
        apiKey: 'sk-tianyi-test',
      })
      const result = adapter.validateConfig()
      expect(result.valid).toBe(true)
      expect(adapter.credentials.baseUrl).toBe('https://api.openai.com/v1')
    })
  })
})
