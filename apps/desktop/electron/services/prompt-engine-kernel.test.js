// @ts-check
/**
 * prompt-engine-kernel.test.js — 共享内核（领域中立）测试
 * openspec change prompt-engine-kernel-refactor specs/prompt-engine
 * 覆盖：导出完整性、extractOptimizedBase fail-closed 核心、守卫/归一/clamp。
 */
import { describe, expect, it, vi } from 'vitest'

const {
  PROMPT_ENGINE_STYLES,
  PROMPT_ENGINE_STYLE_ALIASES,
  DEFAULT_PROMPT_ENGINE_STYLE,
  PROMPT_ENGINE_LIMITS,
  SENSITIVE_CONTEXT_KEYS,
  assertNoSensitiveContext,
  normalizePromptEngineStyle,
  clampNumber,
  extractOptimizedBase,
} = require('./prompt-engine-kernel')

describe('prompt-engine-kernel 导出完整性', () => {
  it('领域中立导出齐备且类型正确', () => {
    expect(PROMPT_ENGINE_STYLES.has('realistic')).toBe(true)
    expect(PROMPT_ENGINE_STYLE_ALIASES.cinematic).toBe('photography')
    expect(DEFAULT_PROMPT_ENGINE_STYLE).toBe('realistic')
    expect(PROMPT_ENGINE_LIMITS.creativeLevel).toEqual({ min: 1, max: 10, default: 5 })
    expect(PROMPT_ENGINE_LIMITS.maxLength).toEqual({ min: 50, max: 2000, default: 500 })
    expect(SENSITIVE_CONTEXT_KEYS.has('api_key')).toBe(true)
    expect(typeof assertNoSensitiveContext).toBe('function')
    expect(typeof normalizePromptEngineStyle).toBe('function')
    expect(typeof clampNumber).toBe('function')
    expect(typeof extractOptimizedBase).toBe('function')
  })

  it('maxLength 归属标注：视频契约不得借用（由 videoMaxLengthRanges 承担）', () => {
    // 内核 JSDoc 约束由代码评审保障；此处断言图片语义不变
    expect(PROMPT_ENGINE_LIMITS.maxLength.max).toBe(2000)
  })
})

describe('extractOptimizedBase fail-closed 核心', () => {
  it('非对象拒绝', () => {
    expect(extractOptimizedBase(null).ok).toBe(false)
    expect(extractOptimizedBase('str').ok).toBe(false)
    expect(extractOptimizedBase([]).ok).toBe(false)
  })

  it('error 有值即失败（含空串 trim）', () => {
    expect(extractOptimizedBase({ optimized_prompt: 'x', error: 'boom' }).ok).toBe(false)
    expect(extractOptimizedBase({ optimized_prompt: 'x', error: '  ' }).ok).toBe(true)
  })

  it('detail 422 拒绝（数组 msg 拼接）', () => {
    const r = extractOptimizedBase({ optimized_prompt: 'x', detail: [{ msg: 'a' }, { msg: 'b' }] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('a; b')
  })

  it('optimized_prompt 缺失/空串拒绝', () => {
    expect(extractOptimizedBase({}).ok).toBe(false)
    expect(extractOptimizedBase({ optimized_prompt: '   ' }).ok).toBe(false)
  })

  it('maxLength 截断 + warn 回调 + truncated 标记', () => {
    const warn = vi.fn()
    const r = extractOptimizedBase({ optimized_prompt: 'abcdefghij' }, { maxLength: 5, warn })
    expect(r.ok).toBe(true)
    expect(r.prompt).toBe('abcde')
    expect(r.truncated).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('基础 meta 透传（platform/style/model_used/key_source），未知键忽略', () => {
    const r = extractOptimizedBase({ optimized_prompt: 'x', platform: 'p', style: 's', model_used: 'm', key_source: 'k', extra: 1 })
    expect(r.meta).toEqual({ platform: 'p', style: 's', model_used: 'm', key_source: 'k' })
  })

  it('index 前缀：场景 N 前缀加入错误信息', () => {
    const r = extractOptimizedBase({ error: 'e' }, { index: 3 })
    expect(r.error).toContain('场景 3')
  })

  it('engineLabel：领域文案注入且默认零变化', () => {
    const r = extractOptimizedBase({ error: 'e' }, { engineLabel: '视频' })
    expect(r.error).toContain('prompt-engine 视频优化失败')
    const plain = extractOptimizedBase({ error: 'e' })
    expect(plain.error).toContain('prompt-engine 优化失败')
    expect(plain.error).not.toContain(' 视频优化')
  })
})

describe('守卫与归一', () => {
  it('assertNoSensitiveContext：敏感键拒绝 / 干净对象通过', () => {
    expect(() => assertNoSensitiveContext({ api_key: 'sk' }, 'ctx')).toThrow(/敏感凭据/)
    expect(() => assertNoSensitiveContext({ token: 't' })).toThrow(/敏感凭据/)
    expect(() => assertNoSensitiveContext({ full_text: 'abc', nested: { ok: 1 } })).not.toThrow()
  })

  it('normalizePromptEngineStyle：别名归一 + 未知回退', () => {
    expect(normalizePromptEngineStyle('cinematic')).toBe('photography')
    expect(normalizePromptEngineStyle('3d-render')).toBe('3d_render')
    expect(normalizePromptEngineStyle('nope')).toBe('realistic')
    expect(normalizePromptEngineStyle(undefined)).toBe('realistic')
  })

  it('clampNumber 边界', () => {
    expect(clampNumber(5, 1, 10)).toBe(5)
    expect(clampNumber(0, 1, 10)).toBe(1)
    expect(clampNumber(99, 1, 10)).toBe(10)
  })
})
