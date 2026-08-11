import { describe, it, expect } from 'vitest'
import { formatUserError, USER_ERROR_CODES } from './user-facing-error'

describe('formatUserError — errorCode 优先', () => {
  it('AUTH_REQUIRED：中文含原因+建议，不暴露通道名', () => {
    const result = formatUserError(
      { code: -3, errorCode: 'AUTH_REQUIRED', message: '当前许可证无权访问该功能，请先登录并确认账号已开通所需权益后重试。', messageParams: { channel: 'store:list-publish-history' } },
      { locale: 'zh' },
    )
    expect(result.errorCode).toBe('AUTH_REQUIRED')
    expect(result.message).toContain('登录')
    expect(result.message).toContain('重试')
    expect(result.message).not.toContain('store:list-publish-history')
    expect(result.message).not.toContain(':')
  })

  it('AUTH_REQUIRED：英文输出自然语言', () => {
    const result = formatUserError({ code: -3, errorCode: 'AUTH_REQUIRED', message: 'x' }, { locale: 'en' })
    expect(result.message).toContain('sign in')
    expect(result.message).not.toContain('store:')
  })

  it('ENTITLEMENT_REQUIRED / UNTRUSTED_SENDER 映射', () => {
    const entitlement = formatUserError({ code: -3, errorCode: 'ENTITLEMENT_REQUIRED', messageParams: { channel: 'publish:wechat' } }, { locale: 'zh' })
    expect(entitlement.errorCode).toBe('ENTITLEMENT_REQUIRED')
    expect(entitlement.message).toContain('权益')

    const untrusted = formatUserError({ code: -3, errorCode: 'UNTRUSTED_SENDER', message: '未授权的调用来源' }, { locale: 'zh' })
    expect(untrusted.errorCode).toBe('UNTRUSTED_SENDER')
    expect(untrusted.message).toContain('重启')
  })

  it('已知 errorCode 未在 catalog 时降级到 code/pattern/透传/fallback', () => {
    // 非技术文本 → 原样透传（保留具体原因）
    const result = formatUserError({ code: -1, errorCode: 'SOME_FUTURE_CODE', message: 'unknown internal' }, { locale: 'zh', fallback: '自定义兜底' })
    expect(result.errorCode).toBe(USER_ERROR_CODES.OPERATION_FAILED)
    expect(result.message).toBe('unknown internal')
    // 技术文本 → 使用 fallback
    const technical = formatUserError({ code: -1, errorCode: 'SOME_FUTURE_CODE', message: 'store:foo failed' }, { locale: 'zh', fallback: '自定义兜底' })
    expect(technical.message).toBe('自定义兜底')
  })
})

describe('formatUserError — 数值 code 映射', () => {
  it.each([
    [-3, USER_ERROR_CODES.AUTH_REQUIRED],
    [-2, USER_ERROR_CODES.VALIDATION_ERROR],
    [-10, USER_ERROR_CODES.NOT_FOUND],
    [-11, USER_ERROR_CODES.TIMEOUT],
    [-12, USER_ERROR_CODES.NETWORK_ERROR],
    [-13, USER_ERROR_CODES.IO_ERROR],
    [429, USER_ERROR_CODES.RATE_LIMITED],
    [402, USER_ERROR_CODES.QUOTA_EXCEEDED],
  ])('code %s → %s', (code, errorCode) => {
    const result = formatUserError({ code, message: 'raw technical' }, { locale: 'zh' })
    expect(result.errorCode).toBe(errorCode)
    expect(result.matched).toBe('code')
    expect(result.message).toBeTruthy()
  })
})

describe('formatUserError — 遗留 pattern 兜底', () => {
  it('含通道名的旧式 message 不直出（pattern 命中）', () => {
    const result = formatUserError({ code: -3, message: '当前许可证无权访问 store:list-publish-history' }, { locale: 'zh' })
    expect(result.errorCode).toBe(USER_ERROR_CODES.AUTH_REQUIRED)
    expect(result.message).not.toContain('store:list-publish-history')
  })

  it('网络/超时/限流 pattern', () => {
    expect(formatUserError({ message: 'connect ECONNREFUSED 127.0.0.1:8002' }, { locale: 'zh' }).errorCode).toBe(USER_ERROR_CODES.NETWORK_ERROR)
    expect(formatUserError({ message: 'request timed out' }, { locale: 'zh' }).errorCode).toBe(USER_ERROR_CODES.TIMEOUT)
    expect(formatUserError({ message: 'HTTP 429 too many requests' }, { locale: 'zh' }).errorCode).toBe(USER_ERROR_CODES.RATE_LIMITED)
  })
})

describe('formatUserError — 未知错误安全兜底', () => {
  it('含技术标识的文本不直出，使用 fallback', () => {
    const channelLike = formatUserError({ code: -1, message: 'store:list-publish-history failed' }, { locale: 'zh', fallback: '操作失败，请稍后重试' })
    expect(channelLike.errorCode).toBe(USER_ERROR_CODES.OPERATION_FAILED)
    expect(channelLike.message).toBe('操作失败，请稍后重试')
    expect(channelLike.message).not.toContain('store:')

    const codeLike = formatUserError({ code: -1, message: 'VOICE_CATALOG_UNAVAILABLE' }, { locale: 'zh', fallback: '加载失败' })
    expect(codeLike.message).toBe('加载失败')

    const stackLike = formatUserError({ code: -1, message: 'boom at line 42' }, { locale: 'zh', fallback: '加载失败' })
    expect(stackLike.message).toBe('加载失败')
  })

  it('自然语言原因文本原样透传（保留具体原因，不丢信息）', () => {
    const fromError = formatUserError(new Error('排期失败：任务不存在'), { locale: 'zh', fallback: '加载失败' })
    expect(fromError.message).toBe('排期失败：任务不存在')
    const fromString = formatUserError('网络错误', { locale: 'zh', fallback: '加载失败' })
    expect(fromString.message).toBe('网络错误')
  })

  it('无 fallback 且文本为技术标识时使用通用文案', () => {
    const result = formatUserError({ code: -1, message: 'internal store:foo at line 3' }, { locale: 'en' })
    expect(result.errorCode).toBe(USER_ERROR_CODES.OPERATION_FAILED)
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toContain('store:foo')
  })
})
