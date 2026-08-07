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