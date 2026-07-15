// @ts-check
/**
 * provider-error.test.js — P3.0 TDD: ProviderError 错误类型测试
 *
 * 验证：
 * - ProviderError 包含 code/category/retryable/context
 * - ERROR_CODES 常量字典完整
 * - HTTP 状态码映射
 */

import { describe, it, expect } from 'vitest'

const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

describe('ProviderError — P3.0 错误类型', () => {
  describe('ProviderError 构造', () => {
    it('创建带 code 和 message 的 ProviderError', () => {
      const err = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid API key')
      expect(err).toBeInstanceOf(Error)
      expect(err.code).toBe(ERROR_CODES.AUTH_FAILED)
      expect(err.message).toBe('Invalid API key')
    })

    it('包含 category 字段（错误分类）', () => {
      const err = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Auth failed')
      expect(err.category).toBe('auth')
    })

    it('包含 retryable 字段（是否可重试）', () => {
      const err = new ProviderError(ERROR_CODES.RATE_LIMITED, 'Rate limited')
      expect(err.retryable).toBe(true)
    })

    it('AUTH_FAILED 不可重试', () => {
      const err = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Auth failed')
      expect(err.retryable).toBe(false)
    })

    it('包含 context 字段（附加上下文）', () => {
      const err = new ProviderError(ERROR_CODES.TIMEOUT, 'Request timeout', {
        providerId: 'openai',
        latencyMs: 30000,
      })
      expect(err.context).toEqual({ providerId: 'openai', latencyMs: 30000 })
    })

    it('toString 包含 code 和 message', () => {
      const err = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid key')
      expect(err.toString()).toContain('AUTH_FAILED')
      expect(err.toString()).toContain('Invalid key')
    })
  })

  describe('ERROR_CODES 常量字典', () => {
    it('包含 AUTH_FAILED', () => {
      expect(ERROR_CODES.AUTH_FAILED).toBe('AUTH_FAILED')
    })

    it('包含 RATE_LIMITED', () => {
      expect(ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED')
    })

    it('包含 TIMEOUT', () => {
      expect(ERROR_CODES.TIMEOUT).toBe('TIMEOUT')
    })

    it('包含 NETWORK_ERROR', () => {
      expect(ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR')
    })

    it('包含 INVALID_CONFIG', () => {
      expect(ERROR_CODES.INVALID_CONFIG).toBe('INVALID_CONFIG')
    })

    it('包含 PROVIDER_ERROR（通用供应商错误）', () => {
      expect(ERROR_CODES.PROVIDER_ERROR).toBe('PROVIDER_ERROR')
    })

    it('包含 NOT_IMPLEMENTED', () => {
      expect(ERROR_CODES.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED')
    })
  })

  describe('fromHttpStatus — HTTP 状态码映射', () => {
    it('401 → AUTH_FAILED', () => {
      const err = fromHttpStatus(401, 'Unauthorized')
      expect(err.code).toBe(ERROR_CODES.AUTH_FAILED)
      expect(err.retryable).toBe(false)
    })

    it('403 → AUTH_FAILED', () => {
      const err = fromHttpStatus(403, 'Forbidden')
      expect(err.code).toBe(ERROR_CODES.AUTH_FAILED)
    })

    it('429 → RATE_LIMITED', () => {
      const err = fromHttpStatus(429, 'Too many requests')
      expect(err.code).toBe(ERROR_CODES.RATE_LIMITED)
      expect(err.retryable).toBe(true)
    })

    it('500 → PROVIDER_ERROR', () => {
      const err = fromHttpStatus(500, 'Internal server error')
      expect(err.code).toBe(ERROR_CODES.PROVIDER_ERROR)
      expect(err.retryable).toBe(true)
    })

    it('timeout → TIMEOUT', () => {
      const err = fromHttpStatus(0, 'ETIMEDOUT')
      expect(err.code).toBe(ERROR_CODES.TIMEOUT)
      expect(err.retryable).toBe(true)
    })
  })

  // ─── P3.0 质量节拍补跑：边界场景 ───
  describe('P3.0 补跑：fromHttpStatus 边界', () => {
    it('status=0 + 非 timeout 消息 → NETWORK_ERROR', () => {
      const err = fromHttpStatus(0, 'ECONNREFUSED')
      expect(err.code).toBe(ERROR_CODES.NETWORK_ERROR)
      expect(err.retryable).toBe(true)
    })

    it('status=0 + "timeout" 关键字 → TIMEOUT', () => {
      const err = fromHttpStatus(0, 'request timeout')
      expect(err.code).toBe(ERROR_CODES.TIMEOUT)
    })

    it('status=200 → PROVIDER_ERROR（非错误状态码也映射）', () => {
      const err = fromHttpStatus(200, 'Unexpected response')
      expect(err.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('status=302 → PROVIDER_ERROR', () => {
      const err = fromHttpStatus(302, 'Redirect')
      expect(err.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('status=503 → PROVIDER_ERROR', () => {
      const err = fromHttpStatus(503, 'Service unavailable')
      expect(err.code).toBe(ERROR_CODES.PROVIDER_ERROR)
    })

    it('fromHttpStatus 包含 statusCode 在 context 中', () => {
      const err = fromHttpStatus(401, 'Unauthorized', { providerId: 'openai' })
      expect(err.context.statusCode).toBe(401)
      expect(err.context.providerId).toBe('openai')
    })
  })

  describe('P3.0 补跑：ProviderError 未知 code', () => {
    it('未知 code → category="unknown", retryable=false', () => {
      const err = new ProviderError('UNKNOWN_CODE', 'Some error')
      expect(err.category).toBe('unknown')
      expect(err.retryable).toBe(false)
    })

    it('context 默认为空对象', () => {
      const err = new ProviderError(ERROR_CODES.TIMEOUT, 'timeout')
      expect(err.context).toEqual({})
    })
  })

  describe('P3.0 补跑：ERROR_CODES 冻结', () => {
    it('ERROR_CODES 被 Object.freeze 冻结', () => {
      expect(Object.isFrozen(ERROR_CODES)).toBe(true)
    })

    it('ERROR_CODES 不能被修改（strict mode 抛错）', () => {
      'use strict'
      expect(() => { ERROR_CODES.AUTH_FAILED = 'modified' }).toThrow()
    })
  })

  describe('P3.0 补跑：ProviderError toString', () => {
    it('toString 格式为 [CODE] message', () => {
      const err = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid key')
      expect(err.toString()).toBe('[AUTH_FAILED] Invalid key')
    })
  })
})
