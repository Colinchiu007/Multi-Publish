// @vitest-environment node
'use strict'

const {
  ProviderError,
  ERROR_CODES,
  fromHttpStatus,
  hasStrictContentPolicySignal,
} = require('./provider-error')

describe('ProviderError content-policy classification', () => {
  it('exposes CONTENT_POLICY as a distinct, non-generic provider category', () => {
    const error = new ProviderError(ERROR_CODES.CONTENT_POLICY, 'Provider rejected the request')

    expect(error).toMatchObject({
      code: ERROR_CODES.CONTENT_POLICY,
      category: 'content_policy',
      retryable: false,
    })
  })

  it('only recognizes explicit provider content-policy signals', () => {
    expect(hasStrictContentPolicySignal('content_policy_violation')).toBe(true)
    expect(hasStrictContentPolicySignal('Request was rejected as a result of our safety system.')).toBe(true)
    expect(hasStrictContentPolicySignal('Safety guidelines are available in our documentation.')).toBe(false)
    expect(hasStrictContentPolicySignal('The prompt is invalid.')).toBe(false)
  })

  it('recognizes MiniMax input new_sensitive as a strict content-policy signal (2026-08-30 复盘 mtequszp_enqn)', () => {
    expect(hasStrictContentPolicySignal('input new_sensitive')).toBe(true)
    expect(hasStrictContentPolicySignal('input new sensitive')).toBe(true)
    expect(hasStrictContentPolicySignal('new_sensitive')).toBe(true)
    expect(hasStrictContentPolicySignal('new sensitive')).toBe(true)
    // 普通「sensitive」单独出现不得误判（避免把普通说明当内容拒绝）
    expect(hasStrictContentPolicySignal('sensitive')).toBe(false)
    expect(hasStrictContentPolicySignal('This data is sensitive.')).toBe(false)
  })

  it('does not turn ordinary 400 and 403 responses into content-policy rejections', () => {
    expect(fromHttpStatus(400, 'Invalid image size').code).toBe(ERROR_CODES.PROVIDER_ERROR)
    expect(fromHttpStatus(403, 'Forbidden').code).toBe(ERROR_CODES.AUTH_FAILED)
  })

  it.each([0, 401, 403, 429])('keeps status %s out of the content-policy path even with a strict signal', (statusCode) => {
    expect(fromHttpStatus(statusCode, 'content_policy_violation', {
      providerCode: 'content_policy_violation',
      contentPolicy: true,
    }).code).not.toBe(ERROR_CODES.CONTENT_POLICY)
  })

  it('maps a strict safety rejection signal to CONTENT_POLICY before the generic HTTP mapping', () => {
    const error = fromHttpStatus(400, 'content_policy_violation', { providerId: 'openai-image' })

    expect(error).toMatchObject({
      code: ERROR_CODES.CONTENT_POLICY,
      category: 'content_policy',
      context: { providerId: 'openai-image', statusCode: 400 },
    })
  })
})
describe('classifyProviderFailure — 空响应/缺失数据按瞬时错误处理', () => {
  const { classifyProviderFailure } = require('./provider-error')

  it('TTS 缺失音频（Missing audio data in response）→ transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing audio data in response', { providerId: 'minimax-tts' })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('生图空结果（returned no image result）→ transient', () => {
    const error = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'provider returned no image result (empty response)')
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('普通未知错误仍为 other，不重试', () => {
    expect(classifyProviderFailure(new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Unknown provider error'))).toBe('other')
  })
})

describe('classifyProviderFailure — 上游服务端/网络瞬时错误按 transient 重试（2026-08-30 复盘 mtelxg9v_v5d6）', () => {
  const { classifyProviderFailure } = require('./provider-error')

  it('MiniMax 生图 "system error" → transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'system error', { providerId: 'minimax-multimodal' })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('agnes-image "fetch failed" → transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.NETWORK_ERROR, 'fetch failed', { providerId: 'agnes-image' })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('HTTP 500 服务端错误 → transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'server error', { providerId: 'openai-image', statusCode: 500 })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('HTTP 503 网关不可用 → transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Service Unavailable', { providerId: 'minimax-multimodal', statusCode: 503 })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('socket hang up → transient，可短退避重试', () => {
    const error = new ProviderError(ERROR_CODES.NETWORK_ERROR, 'socket hang up', { providerId: 'agnes-image' })
    expect(classifyProviderFailure(error)).toBe('transient')
  })

  it('认证失败仍不重试（不被 5xx/瞬时模式误判）', () => {
    const error = new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid API key', { providerId: 'minimax', statusCode: 401 })
    expect(classifyProviderFailure(error)).toBe('other')
  })

  it('额度耗尽仍不重试（不被 5xx/瞬时模式误判）', () => {
    const error = new ProviderError(ERROR_CODES.QUOTA_EXCEEDED, 'Insufficient balance', { providerId: 'minimax', statusCode: 402 })
    expect(classifyProviderFailure(error)).toBe('quota')
  })

  it('限流仍归为 rate（不被 5xx/瞬时模式误判）', () => {
    const error = new ProviderError(ERROR_CODES.RATE_LIMITED, 'rate limit reached', { providerId: 'minimax', statusCode: 429 })
    expect(classifyProviderFailure(error)).toBe('rate')
  })
})

describe('classifyContentPolicyType — 敏感类型分类（2026-08-30 方案层 1）', () => {
  const { classifyContentPolicyType, normalizeContentPolicySignal } = require('./provider-error')

  it('normalizeContentPolicySignal 归一化供应商原始信号为统一枚举', () => {
    expect(normalizeContentPolicySignal('input new_sensitive')).toBe('input_new_sensitive')
    expect(normalizeContentPolicySignal('content_policy_violation')).toBe('content_policy_violation')
    expect(normalizeContentPolicySignal('Content Policy Violation')).toBe('content_policy_violation')
    expect(normalizeContentPolicySignal('  moderation_flagged  ')).toBe('moderation_flagged')
  })

  it('classifyContentPolicyType 识别暴力类信号', () => {
    expect(classifyContentPolicyType('violent content')).toBe('violence')
    expect(classifyContentPolicyType('graphic violence')).toBe('violence')
    expect(classifyContentPolicyType('gore')).toBe('violence')
  })

  it('classifyContentPolicyType 识别色情/裸露类信号', () => {
    expect(classifyContentPolicyType('sexual content')).toBe('sexual')
    expect(classifyContentPolicyType('nudity')).toBe('sexual')
    expect(classifyContentPolicyType('explicit sexual')).toBe('sexual')
  })

  it('classifyContentPolicyType 识别人物肖像类信号', () => {
    expect(classifyContentPolicyType('real person likeness')).toBe('portrait')
    expect(classifyContentPolicyType('celebrity likeness')).toBe('portrait')
    expect(classifyContentPolicyType('public figure')).toBe('portrait')
  })

  it('classifyContentPolicyType 识别政治/未成年人/自伤类信号', () => {
    expect(classifyContentPolicyType('political content')).toBe('political')
    expect(classifyContentPolicyType('minor')).toBe('minor')
    expect(classifyContentPolicyType('child')).toBe('minor')
    expect(classifyContentPolicyType('self-harm')).toBe('selfharm')
    expect(classifyContentPolicyType('self harm')).toBe('selfharm')
  })

  it('classifyContentPolicyType 对未知信号返回 unknown（保守兜底）', () => {
    expect(classifyContentPolicyType('input new_sensitive')).toBe('unknown')
    expect(classifyContentPolicyType('content_policy_violation')).toBe('unknown')
    expect(classifyContentPolicyType('')).toBe('unknown')
    expect(classifyContentPolicyType(null)).toBe('unknown')
  })

  it('classifyContentPolicyType 识别中文错误信号（2026-08-30 调优：供应商可能返回中文内容安全错误）', () => {
    expect(classifyContentPolicyType('内容涉及未成年人')).toBe('minor')
    expect(classifyContentPolicyType('包含暴力血腥内容')).toBe('violence')
    expect(classifyContentPolicyType('涉及政治人物')).toBe('political')
    expect(classifyContentPolicyType('含色情内容')).toBe('sexual')
    expect(classifyContentPolicyType('含裸露画面')).toBe('sexual')
    expect(classifyContentPolicyType('涉及自杀自伤')).toBe('selfharm')
    expect(classifyContentPolicyType('涉及真人肖像')).toBe('portrait')
  })

  it('classifyContentPolicyType 带 provider 命中映射表（优化点 3）', () => {
    // 已知 provider 信号命中映射表，而非 unknown
    expect(classifyContentPolicyType('new_sensitive', 'minimax-image')).toBe('unknown')
    expect(classifyContentPolicyType('content_policy_violation', 'openai-image')).toBe('unknown')
    // 映射表覆盖的信号返回对应类型
    expect(classifyContentPolicyType('violence_detected', 'minimax-image')).toBe('violence')
    expect(classifyContentPolicyType('nudity', 'stable-diffusion')).toBe('sexual')
  })

  it('classifyContentPolicyType 带 provider 未命中映射表回退文本分类（优化点 3）', () => {
    // 未命中映射表但文本可分类 → 回退文本分类
    expect(classifyContentPolicyType('political content', 'minimax-image')).toBe('political')
    expect(classifyContentPolicyType('child', 'openai-image')).toBe('minor')
    // 完全未知 → unknown
    expect(classifyContentPolicyType('input new_sensitive', 'minimax-image')).toBe('unknown')
  })
})
