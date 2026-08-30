// @vitest-environment node
'use strict'

const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')
const {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  buildContentPolicySafePrompt,
  isContentPolicyRejection,
  runContentPolicyImageRetry,
} = require('./story2video-image-retry')

describe('Story2Video image content-policy retry', () => {
  it('auth 失败（如过期 Key）立即失败，不进入内容策略重试圈（2026-08-16 复盘回归）', async () => {
    const generate = vi.fn(async () => {
      throw new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid api key', { statusCode: 1004 })
    })

    const result = await runContentPolicyImageRetry({
      prompt: '任意场景',
      sceneIndex: 0,
      generate,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('failed')
    expect(result.error.message).toBe('Invalid api key')
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'failed', category: 'auth' }),
    ])
  })

  it('needsUserInputMessage：content_policy 与 empty_result 消息区分，且空结果消息不内嵌 content-policy（2026-08-16 审查补强）', () => {
    const { needsUserInputMessage } = require('./story2video-image-retry')
    const contentPolicyMsg = needsUserInputMessage({ reason: 'content_policy' })
    expect(contentPolicyMsg).toContain('content-policy review')

    const emptyResultMsg = needsUserInputMessage({ reason: 'empty_result' })
    expect(emptyResultMsg).toContain('repeatedly returned no result')
    expect(emptyResultMsg).not.toContain('content-policy')

    const fallbackMsg = needsUserInputMessage(null)
    expect(fallbackMsg).toContain('repeatedly returned no result')
    expect(fallbackMsg).not.toContain('content-policy')
  })

  it('classifies only explicit content-policy errors as rewrite candidates', () => {
    expect(isContentPolicyRejection(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'blocked'))).toBe(true)
    expect(isContentPolicyRejection({ code: 'content_policy_violation', statusCode: 400 })).toBe(true)
    expect(isContentPolicyRejection(new ProviderError(ERROR_CODES.AUTH_FAILED, 'forbidden'))).toBe(false)
    expect(isContentPolicyRejection({
      code: ERROR_CODES.CONTENT_POLICY,
      statusCode: 403,
      message: 'content_policy_violation',
    })).toBe(false)
    expect(isContentPolicyRejection({ statusCode: 400, message: 'Invalid image size' })).toBe(false)
    expect(isContentPolicyRejection(new Error('Please review our safety guidelines.'))).toBe(false)
  })

  it('treats MiniMax input new_sensitive as a content-policy rejection and rewrites+retries (2026-08-30 复盘 mtequszp_enqn)', async () => {
    const rawPrompt = '含敏感表述的原始场景描述'
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'input new_sensitive'))
      .mockResolvedValueOnce({ image: 'accepted' })

    const result = await runContentPolicyImageRetry({
      prompt: rawPrompt,
      sceneIndex: 0,
      generate,
    })

    expect(result.status).toBe('success')
    expect(generate).toHaveBeenCalledTimes(2)
    // 第一次用原始提示词；第二次切内容安全改写
    expect(generate.mock.calls[0][0].promptStrategy).toBe('original')
    expect(generate.mock.calls[1][0].promptStrategy).toBe('content_policy_safe_rewrite')
    expect(generate.mock.calls[1][0].prompt).toBe(buildContentPolicySafePrompt(rawPrompt, { sceneIndex: 0 }))
    expect(result.attempts[0]).toMatchObject({ attempt: 1, outcome: 'content_policy_rejected', category: 'content_policy' })
    expect(result.attempts[1]).toMatchObject({ attempt: 2, outcome: 'success' })
    expect(JSON.stringify(result.attempts)).not.toContain(rawPrompt)
  })

  it('MiniMax input new_sensitive repeated → needs_user_input content_policy checkpoint', async () => {
    const generate = vi.fn(async () => {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'input new_sensitive')
    })

    const result = await runContentPolicyImageRetry({
      prompt: '含敏感表述的场景',
      sceneIndex: 3,
      generate,
    })

    expect(generate).toHaveBeenCalledTimes(MAX_IMAGE_GENERATION_ATTEMPTS)
    expect(result).toMatchObject({
      status: 'needs_user_input',
      checkpoint: { type: 'needs_user_input', reason: 'content_policy', sceneIndex: 3, sceneNumber: 4 },
    })
  })

  it('uses a scene-specific safety rewrite after a policy rejection without retaining raw prompt text in audit metadata', async () => {
    const rawPrompt = '敏感场景原始描述，只能用于供应商生成请求'
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'accepted' })

    const result = await runContentPolicyImageRetry({
      prompt: rawPrompt,
      sceneIndex: 1,
      generate,
    })

    expect(result.status).toBe('success')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      attempt: 1,
      prompt: rawPrompt,
      promptStrategy: 'original',
    }))
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attempt: 2,
      promptStrategy: 'content_policy_safe_rewrite',
    }))
    expect(generate.mock.calls[1][0].prompt).toBe(buildContentPolicySafePrompt(rawPrompt, { sceneIndex: 1 }))
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'content_policy_rejected', sceneIndex: 1, sceneNumber: 2 }),
      expect.objectContaining({ attempt: 2, outcome: 'success', sceneIndex: 1, sceneNumber: 2 }),
    ])
    expect(JSON.stringify(result.attempts)).not.toContain(rawPrompt)
  })

  it('stops after five total content-policy attempts and yields an actionable user-input checkpoint', async () => {
    const rawPrompt = '不得写入审计元数据的原始场景'
    const generate = vi.fn(async () => {
      throw new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation')
    })

    const result = await runContentPolicyImageRetry({
      prompt: rawPrompt,
      sceneIndex: 2,
      generate,
    })

    expect(MAX_IMAGE_GENERATION_ATTEMPTS).toBe(5)
    expect(generate).toHaveBeenCalledTimes(5)
    expect(result).toMatchObject({
      status: 'needs_user_input',
      attempts: expect.any(Array),
      checkpoint: {
        type: 'needs_user_input',
        reason: 'content_policy',
        sceneIndex: 2,
        sceneNumber: 3,
        attempts: 5,
      },
    })
    expect(result.attempts).toHaveLength(5)
    expect(result.checkpoint.recommendation).toMatch(/场景|scene/i)
    expect(JSON.stringify(result)).not.toContain(rawPrompt)
  })

  it.each([
    ERROR_CODES.AUTH_FAILED,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.NETWORK_ERROR,
    ERROR_CODES.INVALID_CONFIG,
  ])('does not retry %s failures', async (code) => {
    const generate = vi.fn(async () => {
      throw new ProviderError(code, 'provider failure')
    })

    const result = await runContentPolicyImageRetry({
      prompt: '普通场景',
      sceneIndex: 0,
      generate,
    })

    expect(result.status).toBe('failed')
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'failed', category: expect.any(String) }),
    ])
  })

  it('empty-result（空图片响应）先同提示词重试，第 3 次起切内容安全改写，5 次后交用户处理', async () => {
    const emptyError = () => {
      const e = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'provider returned no image result (empty response)')
      e.emptyResult = true
      return e
    }
    const generate = vi.fn(async () => { throw emptyError() })

    const result = await runContentPolicyImageRetry({
      prompt: '普通场景描述',
      sceneIndex: 0,
      generate,
    })

    expect(generate).toHaveBeenCalledTimes(5)
    expect(result.status).toBe('needs_user_input')
    expect(result.checkpoint).toMatchObject({ type: 'needs_user_input', reason: 'empty_result', sceneIndex: 0, sceneNumber: 1, attempts: 5 })
    expect(result.checkpoint.recommendation).toMatch(/未返回结果|内容安全策略|服务波动/)
    // 前 2 次保持原提示词；第 3 次起使用内容安全改写
    expect(generate.mock.calls[0][0].promptStrategy).toBe('original')
    expect(generate.mock.calls[1][0].promptStrategy).toBe('original')
    expect(generate.mock.calls[2][0].promptStrategy).toBe('content_policy_safe_rewrite')
    expect(result.attempts[0]).toMatchObject({ attempt: 1, outcome: 'empty_result' })
  })

  it('empty-result 后接成功：同提示词重试成功即返回', async () => {
    const emptyError = () => {
      const e = new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'provider returned no image result (empty response)')
      e.emptyResult = true
      return e
    }
    const generate = vi.fn()
      .mockRejectedValueOnce(emptyError())
      .mockResolvedValueOnce({ image: 'accepted' })

    const result = await runContentPolicyImageRetry({
      prompt: '场景文案',
      sceneIndex: 1,
      generate,
    })

    expect(result.status).toBe('success')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[0][0].prompt).toBe('场景文案')
    expect(generate.mock.calls[1][0].prompt).toBe('场景文案')
    expect(result.attempts).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'empty_result' }),
      expect.objectContaining({ attempt: 2, outcome: 'success' }),
    ])
  })

  it('keeps concurrent scene retry state isolated', async () => {
    const first = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'first' })
    const second = vi.fn(async () => ({ image: 'second' }))

    const [firstResult, secondResult] = await Promise.all([
      runContentPolicyImageRetry({ prompt: 'scene A', sceneIndex: 0, generate: first }),
      runContentPolicyImageRetry({ prompt: 'scene B', sceneIndex: 1, generate: second }),
    ])

    expect(firstResult.attempts).toHaveLength(2)
    expect(secondResult.attempts).toHaveLength(1)
    expect(first.mock.calls[1][0].prompt).toContain('scene A')
    expect(first.mock.calls[1][0].prompt).not.toContain('scene B')
    expect(second.mock.calls[0][0].prompt).toBe('scene B')
  })
})

describe('buildContentPolicySafePrompt — 差异化改写 + 场景上下文感知（2026-08-30 方案层 2）', () => {
  const { buildContentPolicySafePrompt } = require('./story2video-image-retry')

  it('不传敏感类型/上下文时保持通用安全改写（向后兼容）', () => {
    const out = buildContentPolicySafePrompt('一个场景', { sceneIndex: 0 })
    expect(out).toContain('policy-compliant')
    expect(out).toContain('一个场景')
  })

  it('violence 类型使用暴力弱化改写策略', () => {
    const out = buildContentPolicySafePrompt('两人激烈搏斗流血', { sceneIndex: 0, sensitiveType: 'violence' })
    expect(out).toContain('conflict')
    expect(out).toContain('no blood')
  })

  it('sexual 类型使用含蓄改写策略', () => {
    const out = buildContentPolicySafePrompt('亲密场景', { sceneIndex: 0, sensitiveType: 'sexual' })
    expect(out).toContain('modest')
    expect(out).toContain('non-explicit')
  })

  it('portrait 类型使用非特定身份改写策略', () => {
    const out = buildContentPolicySafePrompt('真实名人肖像', { sceneIndex: 0, sensitiveType: 'portrait' })
    expect(out).toContain('non-identifying')
    expect(out).toContain('fictional')
  })

  it('注入 scene_context 锚点保留原文背景（避免背景漂移）', () => {
    const out = buildContentPolicySafePrompt('一个老妇人在厨房做饭', {
      sceneIndex: 0,
      contextBlock: '唐代，中国，老妇人，厨房，油灯',
      anchors: ['唐代', '油灯'],
    })
    expect(out).toContain('唐代')
    expect(out).toContain('油灯')
    expect(out).toContain('老妇人')
  })
})

describe('改写质量验证闭环（2026-08-30 方案层 3）', () => {
  const { validateRewriteSafety, estimateSemanticRetention } = require('./story2video-image-retry')

  it('validateRewriteSafety 检测改写后仍含高危敏感词', () => {
    expect(validateRewriteSafety('a child in a classroom')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('graphic violence scene')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('a peaceful garden with flowers')).toHaveProperty('safe', true)
  })

  it('estimateSemanticRetention 计算改写前后语义保留度', () => {
    const high = estimateSemanticRetention('老妇人在厨房做饭', '老妇人在厨房做饭')
    expect(high).toBeGreaterThan(0.8)
    const low = estimateSemanticRetention('激烈搏斗', '花园里的花朵')
    expect(low).toBeLessThan(0.5)
  })
})

describe('结构化审计（2026-08-30 方案层 4）', () => {
  const { createContentPolicyAudit } = require('./story2video-image-retry')

  it('createContentPolicyAudit 记录敏感类型/改写前后哈希/供应商/结果，且不含原始 prompt', () => {
    const audit = createContentPolicyAudit({
      sceneIndex: 2,
      sensitiveType: 'violence',
      provider: 'minimax-image',
      model: 'image-01',
      originalPrompt: '两人激烈搏斗流血',
      rewrittenPrompt: '两人冲突氛围',
      attempts: 3,
      outcome: 'success',
    })
    expect(audit).toMatchObject({
      sceneIndex: 2,
      sceneNumber: 3,
      sensitiveType: 'violence',
      provider: 'minimax-image',
      model: 'image-01',
      attempts: 3,
      outcome: 'success',
    })
    expect(audit.originalPromptHash).toMatch(/^[a-f0-9]{64}$/)
    expect(audit.rewrittenPromptHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(audit)).not.toContain('两人激烈搏斗流血')
    expect(JSON.stringify(audit)).not.toContain('两人冲突氛围')
  })
})