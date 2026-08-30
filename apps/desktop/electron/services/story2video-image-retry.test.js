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
    const out = buildContentPolicySafePrompt('两人激烈搏斗流血', { sceneIndex: 0, sensitiveType: 'violence', language: 'en' })
    expect(out).toContain('conflict')
    expect(out).toContain('no blood')
  })

  it('sexual 类型使用含蓄改写策略', () => {
    const out = buildContentPolicySafePrompt('亲密场景', { sceneIndex: 0, sensitiveType: 'sexual', language: 'en' })
    expect(out).toContain('modest')
    expect(out).toContain('non-explicit')
  })

  it('portrait 类型使用非特定身份改写策略', () => {
    const out = buildContentPolicySafePrompt('真实名人肖像', { sceneIndex: 0, sensitiveType: 'portrait', language: 'en' })
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

  it('buildNegativePrompt 按敏感类型生成排除指令（优化点 4）', () => {
    const { buildNegativePrompt } = require('./story2video-image-retry')
    expect(buildNegativePrompt('violence')).toContain('no blood')
    expect(buildNegativePrompt('violence')).toContain('no weapons')
    expect(buildNegativePrompt('sexual')).toContain('no nudity')
    expect(buildNegativePrompt('minor')).toContain('no minors')
    expect(buildNegativePrompt('unknown')).toContain('no sensitive')
  })

  it('detectPromptLanguage 识别中文/英文原文（优化点 7）', () => {
    const { detectPromptLanguage } = require('./story2video-image-retry')
    expect(detectPromptLanguage('一位老妇人在厨房做饭')).toBe('zh')
    expect(detectPromptLanguage('a child in a classroom')).toBe('en')
    expect(detectPromptLanguage('')).toBe('en')
  })

  it('中文原文使用中文改写指令（优化点 7）', () => {
    const out = buildContentPolicySafePrompt('一个孩子在教室', {
      sceneIndex: 0,
      sensitiveType: 'minor',
    })
    // 中文原文应注入中文改写指令
    expect(out).toContain('成年角色')
    expect(out).toContain('不出现未成年人')
  })

  it('severe 类型使用更强改写指令（优化点 8）', () => {
    const out = buildContentPolicySafePrompt('一个孩子在教室', {
      sceneIndex: 0,
      sensitiveType: 'minor',
      language: 'en',
    })
    // severe（minor）应包含更强改写指令
    expect(out).toContain('adult characters')
    expect(out).toContain('child-like')
    // 优化点 8：severe 追加更强改写指令
    expect(out).toContain('Strictly exclude all sensitive elements')
  })

  it('mild 类型使用保守改写保留更多语义（优化点 8）', () => {
    const out = buildContentPolicySafePrompt('两人激烈搏斗流血', {
      sceneIndex: 0,
      sensitiveType: 'violence',
      language: 'en',
    })
    // mild（violence）保守改写，保留场景氛围
    expect(out).toContain('tense conflict')
  })
})

describe('改写质量验证闭环（2026-08-30 方案层 3）', () => {
  const { validateRewriteSafety, estimateSemanticRetention } = require('./story2video-image-retry')

  it('validateRewriteSafety 检测改写后仍含高危敏感词', () => {
    expect(validateRewriteSafety('a child in a classroom')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('graphic violence scene')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('a peaceful garden with flowers')).toHaveProperty('safe', true)
  })

  it('validateRewriteSafety 检测中文高危敏感词（2026-08-30 调优：仅英文正则会漏判中文）', () => {
    expect(validateRewriteSafety('一个孩子在教室')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('儿童在玩耍')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('自杀场景')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('血腥画面')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('裸露身体')).toHaveProperty('safe', false)
    expect(validateRewriteSafety('一位老妇人在厨房里点油灯')).toHaveProperty('safe', true)
  })

  it('estimateSemanticRetention 计算改写前后语义保留度', () => {
    const high = estimateSemanticRetention('老妇人在厨房做饭', '老妇人在厨房做饭')
    expect(high).toBeGreaterThan(0.8)
    const low = estimateSemanticRetention('激烈搏斗', '花园里的花朵')
    expect(low).toBeLessThan(0.5)
  })

  it('estimateSemanticRetention 中文 n-gram 识别部分保留（优化点 1）', () => {
    // 中文改写：保留「老妇人」「厨房」，替换「做饭」→「烹饪」
    const partial = estimateSemanticRetention('老妇人在厨房做饭', '老妇人在厨房烹饪')
    // bigram 重叠应识别出「老妇人」「厨房」等保留成分，保留度 > 0
    expect(partial).toBeGreaterThan(0)
    // 相比完全无关文本，部分保留的保留度应更高
    const unrelated = estimateSemanticRetention('老妇人在厨房做饭', '花园里的花朵')
    expect(partial).toBeGreaterThan(unrelated)
  })

  it('estimateSemanticRetention 英文词干化识别同义词（优化点 1）', () => {
    // child → kid 词干化后归并，保留度应 > 0
    const synonym = estimateSemanticRetention('a child in a classroom', 'a kid in a classroom')
    expect(synonym).toBeGreaterThan(0)
    // 完全无关文本保留度应更低
    const unrelated = estimateSemanticRetention('a child in a classroom', 'a garden with flowers')
    expect(synonym).toBeGreaterThan(unrelated)
  })

  it('preflightRewriteSafety 检测扩展敏感词库中的高危词（优化点 2）', () => {
    const { preflightRewriteSafety } = require('./story2video-image-retry')
    // 扩展词库覆盖 validateRewriteSafety 之外的常见敏感词
    expect(preflightRewriteSafety('a naked body on the beach')).toHaveProperty('safe', false)
    expect(preflightRewriteSafety('a dead body lying on the ground')).toHaveProperty('safe', false)
    expect(preflightRewriteSafety('a peaceful garden with flowers')).toHaveProperty('safe', true)
  })

  it('preflightRewriteSafety 排除否定语境（no weapons 不误判）（优化点 2 增强）', () => {
    const { preflightRewriteSafety } = require('./story2video-image-retry')
    // 否定语境的安全描述不应被误判
    expect(preflightRewriteSafety('a tense standoff, no weapons')).toHaveProperty('safe', true)
    expect(preflightRewriteSafety('a calm scene without blood')).toHaveProperty('safe', true)
    // 肯定语境的敏感词仍被识别
    expect(preflightRewriteSafety('a man holding a weapon')).toHaveProperty('safe', false)
    expect(preflightRewriteSafety('blood on the ground')).toHaveProperty('safe', false)
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

describe('敏感类型分级（方案层 1 增强，2026-08-30）', () => {
  const { CONTENT_POLICY_SEVERITY, runContentPolicyImageRetry } = require('./story2video-image-retry')
  const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')

  it('CONTENT_POLICY_SEVERITY 标注各敏感类型严重度（供改写指令强度参考，不用于直接交用户）', () => {
    expect(CONTENT_POLICY_SEVERITY.minor).toBe('severe')
    expect(CONTENT_POLICY_SEVERITY.selfharm).toBe('severe')
    expect(CONTENT_POLICY_SEVERITY.political).toBe('severe')
    expect(CONTENT_POLICY_SEVERITY.violence).toBe('mild')
    expect(CONTENT_POLICY_SEVERITY.sexual).toBe('mild')
    expect(CONTENT_POLICY_SEVERITY.portrait).toBe('mild')
    expect(CONTENT_POLICY_SEVERITY.unknown).toBe('mild')
  })

  it('severe 敏感类型（minor）也走自动改写重试，不直接交用户（2026-08-30 用户决策：程序/LLM 自动解决）', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation child'))
      .mockResolvedValueOnce({ image: 'ok' })
    // 中文「儿童」被识别为高危词 → 升级 LLM 改写（2026-08-30 调优）
    const rewriteWithLLM = vi.fn(async () => 'a young student in a classroom')

    const result = await runContentPolicyImageRetry({
      prompt: '儿童场景',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })

    // 自动改写重试成功，不交用户
    expect(generate).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
    // 优化点 3：多轮降级（safe/abstract/minimal 三轮）
    expect(rewriteWithLLM).toHaveBeenCalledTimes(3)
    expect(generate.mock.calls[1][0].promptStrategy).toBe('llm_safe_rewrite')
  })

  it('severe 敏感类型（selfharm）也走自动改写重试', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation self harm'))
      .mockResolvedValueOnce({ image: 'ok' })
    // 中文「自伤」被识别为高危词 → 升级 LLM 改写
    const rewriteWithLLM = vi.fn(async () => 'a calm, hopeful scene')

    const result = await runContentPolicyImageRetry({
      prompt: '自伤场景',
      sceneIndex: 1,
      generate,
      rewriteWithLLM,
    })

    expect(generate).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
    // 优化点 3：多轮降级（safe/abstract/minimal 三轮）
    expect(rewriteWithLLM).toHaveBeenCalledTimes(3)
  })

  it('mild 敏感类型（violence）走改写重试', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation violence'))
      .mockResolvedValueOnce({ image: 'ok' })
    // 中文「暴力」被识别为高危词 → 升级 LLM 改写
    const rewriteWithLLM = vi.fn(async () => 'a tense conflict atmosphere')

    const result = await runContentPolicyImageRetry({
      prompt: '暴力场景',
      sceneIndex: 2,
      generate,
      rewriteWithLLM,
    })

    expect(generate).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
    // 优化点 3：多轮降级（safe/abstract/minimal 三轮）
    expect(rewriteWithLLM).toHaveBeenCalledTimes(3)
    expect(generate.mock.calls[1][0].promptStrategy).toBe('llm_safe_rewrite')
  })

  it('unknown 类型走改写重试（保守策略，避免漏判整线失败）', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })

    const result = await runContentPolicyImageRetry({
      prompt: '未知敏感场景',
      sceneIndex: 3,
      generate,
    })

    expect(generate).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
  })
})

describe('改写自检与 LLM 改写升级（方案层 3 增强，2026-08-30）', () => {
  const { runContentPolicyImageRetry } = require('./story2video-image-retry')
  const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')

  it('原文含高危敏感词时，模板改写版（拼入原文）仍含高危词 → 升级 LLM 改写（若提供），不直接交用户', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })
    const rewriteWithLLM = vi.fn(async () => 'a young student in a classroom')

    const result = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })

    // 模板改写自检失败 → 升级 LLM 改写 → 成功
    expect(result.status).toBe('success')
    // 优化点 3：多轮降级（safe/abstract/minimal 三轮）
    expect(rewriteWithLLM).toHaveBeenCalledTimes(3)
    expect(generate).toHaveBeenCalledTimes(2)
    // 第 2 次使用 LLM 改写结果
    expect(generate.mock.calls[1][0].prompt).toContain('young student')
    expect(generate.mock.calls[1][0].promptStrategy).toBe('llm_safe_rewrite')
  })

  it('未提供 rewriteWithLLM 时，模板改写自检失败 → 交用户（兜底）', async () => {
    const generate = vi.fn(async () => {
      throw new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation')
    })

    const result = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate,
    })

    expect(result.status).toBe('needs_user_input')
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0].promptStrategy).toBe('original')
  })

  it('模板改写自检通过时正常发送改写版并重试', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })

    const result = await runContentPolicyImageRetry({
      prompt: '两人激烈搏斗流血',
      sceneIndex: 0,
      generate,
    })

    expect(result.status).toBe('success')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0].promptStrategy).toBe('content_policy_safe_rewrite')
  })

  it('LLM 改写结果仍含高危词时，不发送，交用户（安全兜底）', async () => {
    const generate = vi.fn(async () => {
      throw new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation')
    })
    const rewriteWithLLM = vi.fn(async () => 'a child playing')

    const result = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })

    // LLM 改写结果仍含 child → 不发送，交用户
    expect(result.status).toBe('needs_user_input')
    expect(generate).toHaveBeenCalledTimes(1)
  })
})

describe('敏感改写优化点（2026-08-30）', () => {
  const {
    runContentPolicyImageRetry,
    buildContentPolicySafePrompt,
    aggregateContentPolicyStats,
    CONTENT_POLICY_REWRITE_STRATEGIES_BY_PROVIDER,
    CONTENT_POLICY_REWRITE_STRATEGIES_ZH,
  } = require('./story2video-image-retry')
  const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')

  it('优化点1：LLM 改写后记录语义保留度到审计', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })
    const rewriteWithLLM = vi.fn(async () => 'a young student in a classroom')

    const result = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })

    expect(result.status).toBe('success')
    // 语义保留度记录在 LLM 改写那次尝试的审计中（被拒绝尝试，outcome=content_policy_rejected）
    const llmAttempt = result.attempts.find((a) => a.semanticRetention !== undefined)
    expect(llmAttempt).toBeDefined()
    expect(llmAttempt).toHaveProperty('semanticRetention')
    expect(llmAttempt.semanticRetention).toBeGreaterThan(0)
  })

  it('优化点2：同一敏感类型连续拒绝 2 次 → 模板改写无效，升级 LLM 改写', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation violence'))
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation violence'))
      .mockResolvedValueOnce({ image: 'ok' })
    const rewriteWithLLM = vi.fn(async () => 'a tense standoff, no weapons')

    const result = await runContentPolicyImageRetry({
      prompt: 'a violent fight scene',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })

    expect(result.status).toBe('success')
    expect(generate).toHaveBeenCalledTimes(3)
    // 连续拒绝 2 次后升级 LLM 改写
    expect(generate.mock.calls[2][0].promptStrategy).toBe('llm_safe_rewrite')
  })

  it('优化点4：aggregateContentPolicyStats 聚合敏感类型占比/成功率/保留度', () => {
    const stats = aggregateContentPolicyStats([
      { sensitiveType: 'minor', outcome: 'success', semanticRetention: 0.8 },
      { sensitiveType: 'minor', outcome: 'needs_user_input' },
      { sensitiveType: 'violence', outcome: 'success', semanticRetention: 0.9 },
    ])

    expect(stats.total).toBe(3)
    expect(stats.successRate).toBeCloseTo(0.667, 2)
    expect(stats.byType).toHaveLength(2)
    const minor = stats.byType.find((t) => t.sensitiveType === 'minor')
    expect(minor.count).toBe(2)
    expect(minor.successRate).toBeCloseTo(0.5, 1)
    expect(minor.avgSemanticRetention).toBeCloseTo(0.8, 1)
  })

  it('优化点5：按 provider 定制改写指令（minimax 简洁版）', () => {
    const rewritten = buildContentPolicySafePrompt('a violent fight', {
      sensitiveType: 'violence',
      provider: 'minimax',
    })
    expect(rewritten).toContain('tense conflict atmosphere, no blood, no weapons, no graphic detail')
    expect(CONTENT_POLICY_REWRITE_STRATEGIES_BY_PROVIDER.minimax.violence).toContain('no blood')
  })

  it('优化点5：中文改写指令（language=zh）', () => {
    const rewritten = buildContentPolicySafePrompt('a child in a classroom', {
      sensitiveType: 'minor',
      language: 'zh',
    })
    expect(rewritten).toContain('只表现成年角色，不出现未成年人或儿童形象')
    expect(CONTENT_POLICY_REWRITE_STRATEGIES_ZH.minor).toContain('未成年')
  })

  it('优化点6：改写保留角色一致性与视觉风格（character/style）', () => {
    const rewritten = buildContentPolicySafePrompt('a violent fight', {
      sensitiveType: 'violence',
      character: '老妇人',
      style: '水墨画',
    })
    expect(rewritten).toContain('Keep the same character: 老妇人.')
    expect(rewritten).toContain('Keep the visual style: 水墨画.')
  })

  it('优化点5（新）：LLM 改写同 prompt 哈希缓存复用（不重复调用）', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })
    const rewriteWithLLM = vi.fn(async () => 'a young student in a classroom')

    // 第一次运行：LLM 改写被调用（多轮改写，每轮一次）
    const result1 = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate,
      rewriteWithLLM,
    })
    expect(result1.status).toBe('success')
    const callsAfterFirstRun = rewriteWithLLM.mock.calls.length
    expect(callsAfterFirstRun).toBeGreaterThan(0)

    // 第二次运行（同 prompt）：应复用缓存，不重复调用 LLM
    const generate2 = vi.fn()
      .mockRejectedValueOnce(new ProviderError(ERROR_CODES.CONTENT_POLICY, 'content_policy_violation'))
      .mockResolvedValueOnce({ image: 'ok' })
    const result2 = await runContentPolicyImageRetry({
      prompt: 'a child in a classroom',
      sceneIndex: 0,
      generate: generate2,
      rewriteWithLLM,
    })
    expect(result2.status).toBe('success')
    // 缓存命中：第二次运行 LLM 改写调用次数不再增加
    expect(rewriteWithLLM.mock.calls.length).toBe(callsAfterFirstRun)
  })

  it('优化点6（新）：aggregateContentPolicyStats 输出调优建议（低成功率类型）', () => {
    const stats = aggregateContentPolicyStats([
      { sensitiveType: 'minor', outcome: 'success' },
      { sensitiveType: 'minor', outcome: 'needs_user_input' },
      { sensitiveType: 'minor', outcome: 'needs_user_input' },
      { sensitiveType: 'violence', outcome: 'success' },
    ])
    // 低成功率类型生成调优建议
    expect(Array.isArray(stats.suggestions)).toBe(true)
    const minorSuggestion = stats.suggestions.find((s) => s.sensitiveType === 'minor')
    expect(minorSuggestion).toBeDefined()
    expect(minorSuggestion.successRate).toBeLessThan(0.5)
  })
})