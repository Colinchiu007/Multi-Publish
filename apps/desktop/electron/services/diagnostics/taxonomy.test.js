// @vitest-environment node
'use strict'

const { classifyFailure, classifyFailureType, DIAG_STAGES, DIAG_FAILURE_TYPES, DIAG_SEVERITY, DIAG_RECOVERABILITY } = require('./taxonomy')

describe('taxonomy：统一诊断码分类', () => {
  it('compose + ffmpeg 超时 → timeout / blocker / retryable', () => {
    const result = classifyFailure({
      stage: 'compose',
      errorCode: 'TIMEOUT',
      message: 'ffmpeg timed out after 120000ms',
      runStatus: 'failed',
    })
    expect(result).toEqual({
      stage: 'compose',
      failureType: 'timeout',
      severity: 'blocker',
      recoverability: 'retryable',
    })
  })

  it('split + ECONNREFUSED → infrastructure / retryable', () => {
    const result = classifyFailure({
      stage: 'split',
      message: 'ECONNREFUSED 8002 not running',
      runStatus: 'failed',
    })
    expect(result.failureType).toBe('infrastructure')
    expect(result.severity).toBe('blocker')
    expect(result.recoverability).toBe('retryable')
  })

  it('generate_assets + 429 → provider / retryable', () => {
    const result = classifyFailure({
      stage: 'generate_assets',
      message: '429 rate limit exceeded',
      runStatus: 'failed',
    })
    expect(result.failureType).toBe('provider')
    expect(result.recoverability).toBe('retryable')
  })

  it('内容政策 → content_policy / needs_user_input', () => {
    const result = classifyFailure({
      stage: 'generate_assets',
      message: '内容触发审核策略，请改写该场景为更抽象的视觉描述',
      hasCheckpoint: true,
      runStatus: 'failed',
    })
    expect(result.failureType).toBe('content_policy')
    expect(result.recoverability).toBe('needs_user_input')
  })

  it('ENOSPC → resource / retryable', () => {
    const result = classifyFailure({ stage: 'compose', message: 'ENOSPC no space left on device', runStatus: 'failed' })
    expect(result.failureType).toBe('resource')
  })

  it('Output file is empty → media / degradable', () => {
    const result = classifyFailure({ stage: 'compose', message: 'Output file is empty', runStatus: 'failed' })
    expect(result.failureType).toBe('media')
    expect(result.recoverability).toBe('degradable')
  })

  it('publish 部分成功 → partial_degradation / minor', () => {
    const result = classifyFailure({ stage: 'publish', failedPlatforms: ['wx'], totalPlatforms: 3, runStatus: 'failed' })
    expect(result.failureType).toBe('partial_degradation')
    expect(result.severity).toBe('minor')
  })

  it('空/非法输入 fail-closed 到 unknown 桶且结构稳定、不抛错', () => {
    for (const input of [null, undefined, {}, [], 'compose', 42]) {
      const result = classifyFailure(input)
      expect(Object.keys(result).sort()).toEqual(['failureType', 'recoverability', 'severity', 'stage'])
      expect(result.stage).toBe('unknown')
      expect(result.failureType).toBe('unknown')
      expect(result.severity).toBe('unknown')
      expect(result.recoverability).toBe('unknown')
    }
  })

  it('未知阶段名归一为 unknown，已知别名归一', () => {
    expect(classifyFailure({ stage: 'bogus' }).stage).toBe('unknown')
    expect(classifyFailure({ stage: 'domain-enrich' }).stage).toBe('domain_enrich')
  })

  it('枚举常量齐全且无重复', () => {
    expect(DIAG_STAGES).toContain('compose')
    expect(DIAG_FAILURE_TYPES).toContain('unknown')
    expect(DIAG_SEVERITY).toContain('blocker')
    expect(DIAG_RECOVERABILITY).toContain('needs_user_input')
    expect(new Set(DIAG_STAGES).size).toBe(DIAG_STAGES.length)
  })

  it('classifyFailureType 未知文本返回 unknown', () => {
    expect(classifyFailureType({ message: 'some unrelated text' })).toBe('unknown')
  })

  it('小写 api key 文本 → provider（与根因映射一致）', () => {
    const result = classifyFailure({ stage: 'optimize', message: 'Invalid API key provided', runStatus: 'failed' })
    expect(result.failureType).toBe('provider')
    expect(result.recoverability).toBe('retryable')
  })

  it('Invalid input → validation / permanent', () => {
    const result = classifyFailure({ message: 'Invalid input', runStatus: 'failed' })
    expect(result.failureType).toBe('validation')
    expect(result.recoverability).toBe('permanent')
  })

  it('数值码 429 → provider（即使 message 为空）', () => {
    const result = classifyFailure({ stage: 'generate_assets', code: 429, runStatus: 'failed' })
    expect(result.failureType).toBe('provider')
  })
})

