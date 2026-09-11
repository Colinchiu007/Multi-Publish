import { describe, expect, it } from 'vitest'
import { classifyCollectError } from './collect-error'

describe('classifyCollectError', () => {
  it('classifies invalid URL from Chinese message', () => {
    const r = classifyCollectError('无效的 URL')
    expect(r).toEqual({ reason: 'invalid_url', retryable: false, detailKey: 'collectErrors.invalid_url' })
  })

  it('classifies invalid URL from URL format message', () => {
    expect(classifyCollectError('URL 格式不正确').reason).toBe('invalid_url')
  })

  it('classifies invalid URL from missing params message', () => {
    expect(classifyCollectError('缺少参数对象').reason).toBe('invalid_url')
  })

  it('classifies internal URL', () => {
    const r = classifyCollectError('不允许采集内网地址')
    expect(r).toEqual({ reason: 'internal_url', retryable: false, detailKey: 'collectErrors.internal_url' })
  })

  it('classifies protocol error', () => {
    const r = classifyCollectError('仅支持 http/https 协议')
    expect(r).toEqual({ reason: 'protocol', retryable: false, detailKey: 'collectErrors.protocol' })
  })

  it('classifies budget exhausted', () => {
    const r = classifyCollectError('已达每日采集预算上限')
    expect(r.reason).toBe('budget_exhausted')
    expect(r.retryable).toBe(true)
  })

  it('classifies cooldown', () => {
    expect(classifyCollectError('该平台处于冷却期，请稍后再试').reason).toBe('cooldown')
  })

  it('classifies circuit open', () => {
    expect(classifyCollectError('该平台请求已熔断，请稍后再试').reason).toBe('circuit_open')
  })

  it('classifies rate limited from Chinese message', () => {
    expect(classifyCollectError('请求频率受限，请稍后再试').reason).toBe('rate_limited')
  })

  it('classifies rate limited from English message', () => {
    expect(classifyCollectError('rate limit exceeded (429)').reason).toBe('rate_limited')
  })

  it('classifies rate limited from message containing 429', () => {
    expect(classifyCollectError('429 Too Many Requests').reason).toBe('rate_limited')
  })

  it('classifies security challenge from Chinese message', () => {
    expect(classifyCollectError('URL 触发安全验证，请尝试在浏览器环境采集').reason).toBe('security_challenge')
  })

  it('classifies security challenge from Baidu security message', () => {
    expect(classifyCollectError('百度安全验证').reason).toBe('security_challenge')
  })

  it('classifies security challenge from captcha', () => {
    expect(classifyCollectError('captcha required').reason).toBe('security_challenge')
  })

  it('classifies security challenge from login + verification', () => {
    expect(classifyCollectError('需要登录并完成验证').reason).toBe('security_challenge')
  })

  it('classifies timeout from Chinese message', () => {
    expect(classifyCollectError('请求超时，请稍后重试').reason).toBe('timeout')
  })

  it('classifies timeout from English message', () => {
    expect(classifyCollectError('request timeout').reason).toBe('timeout')
  })

  it('classifies timeout from code -1', () => {
    expect(classifyCollectError({ code: -1, message: '请求超时' }).reason).toBe('timeout')
  })

  it('classifies unreachable from Chinese message', () => {
    expect(classifyCollectError('URL 无法访问').reason).toBe('unreachable')
  })

  it('classifies unreachable from ENOTFOUND', () => {
    expect(classifyCollectError('getaddrinfo ENOTFOUND example.com').reason).toBe('unreachable')
  })

  it('classifies unreachable from code -2', () => {
    expect(classifyCollectError({ code: -2, message: '源不可达' }).reason).toBe('unreachable')
  })

  it('classifies content unextractable from Chinese message', () => {
    expect(classifyCollectError('URL 采集无结果').reason).toBe('content_unextractable')
  })

  it('classifies content unextractable from code -4', () => {
    expect(classifyCollectError({ code: -4, message: '无法提取内容' }).reason).toBe('content_unextractable')
  })

  it('classifies backend unavailable from Chinese message', () => {
    expect(classifyCollectError('后端服务不可用，请稍后重试').reason).toBe('backend_unavailable')
  })

  it('classifies backend unavailable from code -5', () => {
    expect(classifyCollectError({ code: -5, message: 'backend down' }).reason).toBe('backend_unavailable')
  })

  it('classifies network error from English message', () => {
    expect(classifyCollectError('network error').reason).toBe('network_error')
  })

  it('classifies network error from ECONNRESET', () => {
    expect(classifyCollectError('ECONNRESET socket hang up').reason).toBe('network_error')
  })

  it('classifies network error from fetch failed', () => {
    expect(classifyCollectError('fetch failed').reason).toBe('network_error')
  })

  it('classifies unknown for unmatched message', () => {
    const r = classifyCollectError('No handler registered for channel')
    expect(r).toEqual({ reason: 'unknown', retryable: true, detailKey: 'collectErrors.unknown' })
  })

  it('classifies unknown for empty input', () => {
    expect(classifyCollectError('').reason).toBe('unknown')
  })

  it('classifies unknown for null input', () => {
    expect(classifyCollectError(null).reason).toBe('unknown')
  })

  it('classifies from Error instance message', () => {
    expect(classifyCollectError(new Error('URL 无法访问')).reason).toBe('unreachable')
  })

  it('classifies from object with message and code', () => {
    expect(classifyCollectError({ code: -4, message: 'URL 采集无结果' }).reason).toBe('content_unextractable')
  })
})
