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
  normalizeOptimizationStrategy,
  resolveOptimizationStrategy,
  extractOptimizedBase,
  resolveTieredMaxLength,
  filterPlausibleNegativePrompt,
  normalizePositiveConstraints,
  scorePrompt,
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
    expect(typeof normalizeOptimizationStrategy).toBe('function')
    expect(typeof resolveOptimizationStrategy).toBe('function')
    expect(typeof extractOptimizedBase).toBe('function')
    expect(typeof resolveTieredMaxLength).toBe('function')
    expect(typeof filterPlausibleNegativePrompt).toBe('function')
    expect(typeof normalizePositiveConstraints).toBe('function')
    expect(typeof scorePrompt).toBe('function')
  })

  it('策略缺省 llm，creative_level 不参与路由，auto 被拒绝', () => {
    expect(normalizeOptimizationStrategy(' LLM ')).toBe('llm')
    expect(normalizeOptimizationStrategy(undefined)).toBe('llm')
    expect(normalizeOptimizationStrategy('')).toBe('llm')
    expect(() => normalizeOptimizationStrategy('unknown')).toThrow(/optimization_strategy/)
    expect(() => normalizeOptimizationStrategy('auto')).toThrow(/optimization_strategy/)
    expect(() => normalizeOptimizationStrategy(1)).toThrow(/optimization_strategy/)
    expect(resolveOptimizationStrategy({ creative_level: 1, optimization_strategy: 'llm' })).toBe('llm')
    expect(resolveOptimizationStrategy({ creative_level: 10, optimization_strategy: 'template' })).toBe('template')
    expect(resolveOptimizationStrategy({ creative_level: 1 })).toBe('llm')
    expect(resolveOptimizationStrategy({ domain: 'video', creative_level: 1 })).toBe('llm')
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

  it('基础 meta 透传（含策略、调用方与缓存命中），未知键忽略', () => {
    const r = extractOptimizedBase({
      optimized_prompt: 'x',
      platform: 'p',
      style: 's',
      model_used: 'm',
      key_source: 'k',
      strategy_used: 'llm',
      caller: 'multi-publish-desktop',
      cache_hit: false,
      extra: 1,
    })
    expect(r.meta).toEqual({
      platform: 'p',
      style: 's',
      model_used: 'm',
      key_source: 'k',
      strategy_used: 'llm',
      caller: 'multi-publish-desktop',
      cache_hit: false,
    })
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
describe('resolveTieredMaxLength 层级长度', () => {
  it('显式传值收敛到能力范围', () => {
    expect(resolveTieredMaxLength(10, 5, { min: 50, max: 2000 }, 500)).toBe(50)
    expect(resolveTieredMaxLength(3000, 5, { min: 50, max: 2000 }, 500)).toBe(2000)
    expect(resolveTieredMaxLength('800', 5, { min: 50, max: 2000 }, 500)).toBe(800)
  })

  it('未显式 + 高创意（≥7）→ 精修层默认（收敛到 range.max）', () => {
    expect(resolveTieredMaxLength(undefined, 8, { min: 50, max: 2000 }, 500, 2000)).toBe(2000)
    expect(resolveTieredMaxLength(null, 7, { min: 50, max: 2000 }, 500, 1500)).toBe(1500)
    expect(resolveTieredMaxLength('', 9, { min: 50, max: 2000 }, 500)).toBe(2000)
  })

  it('未显式 + 常规创意 → batchDefault；精修默认越界仍收敛', () => {
    expect(resolveTieredMaxLength(undefined, 5, { min: 50, max: 2000 }, 500)).toBe(500)
    expect(resolveTieredMaxLength(undefined, 8, { min: 50, max: 2000 }, 500, 99999)).toBe(2000)
  })
})

describe('filterPlausibleNegativePrompt plausible-only', () => {
  it('保留真实失败类别（中英文）', () => {
    expect(filterPlausibleNegativePrompt('identity drift, extra fingers')).toContain('identity drift')
    expect(filterPlausibleNegativePrompt('身份漂移, 多余手指')).toContain('身份漂移')
    expect(filterPlausibleNegativePrompt('no text, watermarks')).toContain('watermarks')
    expect(filterPlausibleNegativePrompt('character duplication, morphing')).toContain('character duplication')
  })

  it('清理无类别后缀的裸绝对否定词', () => {
    expect(filterPlausibleNegativePrompt('不要坏')).toBe('')
    expect(filterPlausibleNegativePrompt('never bad')).toBe('')
    expect(filterPlausibleNegativePrompt('don\'t ugly')).toBe('')
  })

  it('空串/非字符串 → 空串', () => {
    expect(filterPlausibleNegativePrompt('')).toBe('')
    expect(filterPlausibleNegativePrompt('   ')).toBe('')
    expect(filterPlausibleNegativePrompt(null)).toBe('')
    expect(filterPlausibleNegativePrompt(123)).toBe('')
  })

  it('混合：有效类别保留，无效部分清理', () => {
    const out = filterPlausibleNegativePrompt('不要坏, 多余手指, never bad')
    expect(out).toContain('多余手指')
    expect(out).not.toContain('不要坏')
    expect(out).not.toContain('never bad')
  })

  it('场景排除物/负面锚点保留（非否定词开头的独立约束不被误删）', () => {
    expect(filterPlausibleNegativePrompt('水印, 电烤箱')).toBe('水印, 电烤箱')
    expect(filterPlausibleNegativePrompt('电烤箱')).toBe('电烤箱')
    expect(filterPlausibleNegativePrompt('no text, electric oven')).toBe('no text, electric oven')
  })

  it('否定词前缀 + 实质内容的排除式约束保留（no people/without hats/避免人物）', () => {
    expect(filterPlausibleNegativePrompt('no people')).toBe('no people')
    expect(filterPlausibleNegativePrompt('without hats')).toBe('without hats')
    expect(filterPlausibleNegativePrompt('避免人物')).toBe('避免人物')
    expect(filterPlausibleNegativePrompt('not enough detail')).toBe('not enough detail')
    expect(filterPlausibleNegativePrompt('没有现代建筑, 电烤箱')).toBe('没有现代建筑, 电烤箱')
  })

  it('否定词前缀 + 模糊质量词后缀仍清理（don\'t ugly/never bad/避免丑）', () => {
    expect(filterPlausibleNegativePrompt('不要坏')).toBe('')
    expect(filterPlausibleNegativePrompt('never bad')).toBe('')
    expect(filterPlausibleNegativePrompt('避免丑')).toBe('')
    expect(filterPlausibleNegativePrompt('don\'t ugly')).toBe('')
  })
})

describe('normalizePositiveConstraints 正向约束收敛', () => {
  it('数组透传，非字符串元素丢弃', () => {
    expect(normalizePositiveConstraints(['a', 1, null, { x: 1 }, '  b  '])).toEqual(['a', 'b'])
  })

  it('字符串按换行/分号拆分', () => {
    expect(normalizePositiveConstraints('甲\n乙;丙')).toEqual(['甲', '乙', '丙'])
    expect(normalizePositiveConstraints('only')).toEqual(['only'])
  })

  it('上限 10 条截断，空/非数组 → 空数组', () => {
    const items = Array.from({ length: 15 }, (_, i) => 'item' + i)
    expect(normalizePositiveConstraints(items)).toHaveLength(10)
    expect(normalizePositiveConstraints(undefined)).toEqual([])
    expect(normalizePositiveConstraints(42)).toEqual([])
    expect(normalizePositiveConstraints('')).toEqual([])
  })
})

describe('scorePrompt 四维规则评分', () => {
  it('空 prompt 得 0 分；四维综合评分', () => {
    expect(scorePrompt('')).toBe(0)
    expect(scorePrompt('   ')).toBe(0)
    const rich = 'A warrior running across a ruined city at golden hour, warm amber color palette, cinematic composition, dramatic lighting, epic style, dust and smoke, low angle perspective, rule of thirds, shallow depth of field, detailed armor and weathered skin texture, horse, banner, ruined temple, birds, embers, volumetric light rays, motion blur'
    const score = scorePrompt(rich, { sourcePrompt: '战士 骑马 废墟 黄昏' })
    expect(score).toBeGreaterThan(60)
  })

  it('source 实体保真：命中源实体的候选优于未命中候选（同源择优语义）', () => {
    const hit = scorePrompt('a woman standing in a garden with soft natural light', { sourcePrompt: 'woman garden light' })
    const miss = scorePrompt('a lone castle on a cliff under stormy sky', { sourcePrompt: 'woman garden light' })
    expect(hit).toBeGreaterThan(miss)
  })

  it('构图关键词加分', () => {
    const base = 'a cat sitting, soft light, blue color, realistic style'
    const composed = base + ', close-up, rule of thirds, depth of field, low angle'
    expect(scorePrompt(composed)).toBeGreaterThan(scorePrompt(base))
  })

  it('中文语言模式按字符数评估长度', () => {
    const zhLong = '一名战士在废墟中奔跑'.repeat(30) + '，黄昏的金色光线，暖色调，电影构图，低角度拍摄，景深，灰尘与烟雾，细节丰富的盔甲'
    const score = scorePrompt(zhLong, { language: 'zh' })
    expect(score).toBeGreaterThan(0)
  })

  it('短 source（无中文连续字/无 ≥3 字母英文 token）不产生 NaN（评审 C1）', () => {
    expect(Number.isNaN(scorePrompt('a cat on the windowsill', { sourcePrompt: '猫' }))).toBe(false)
    expect(Number.isNaN(scorePrompt('a cat', { sourcePrompt: 'cat' }))).toBe(false)
    expect(Number.isNaN(scorePrompt('x', { sourcePrompt: '81' }))).toBe(false)
    expect(scorePrompt('a cat', { sourcePrompt: 'cat' })).toBeGreaterThanOrEqual(0)
  })

  it('超长英文按比例轻微惩罚，短英文按比例部分得分（评审 W3）', () => {
    const normal = Array.from({ length: 200 }, (_, i) => 'word' + i).join(' ') + ' composition lighting color style hero'
    const overlong = Array.from({ length: 800 }, (_, i) => 'word' + i).join(' ')
    const short = 'a cat, light, color, style'
    const normalScore = scorePrompt(normal)
    const overlongScore = scorePrompt(overlong)
    const shortScore = scorePrompt(short)
    expect(normalScore).toBeGreaterThan(overlongScore)
    // 超长长度维 10 分 + 保真维无 source 满分 20 → 总分 < 35（若长度维失效则 ≥35）
    expect(overlongScore).toBeLessThan(35)
    // 短英文部分长度分（round 后近 0），总分以保真/要素为主，仍低于正常长度候选
    expect(normalScore).toBeGreaterThan(shortScore)
    expect(shortScore).toBeGreaterThanOrEqual(0)
  })
})
