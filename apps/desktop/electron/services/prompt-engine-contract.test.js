// @vitest-environment node
const {
  PROMPT_ENGINE_PLATFORMS,
  PROMPT_ENGINE_STYLES,
  normalizePromptEngineStyle,
  normalizePromptEnginePlatform,
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
  selectBestCandidate,
  IMAGE_QUALITY_BASELINE,
  PROMPT_ENGINE_CONTEXT_KEYS,
  PROMPT_ENGINE_LIMITS,
} = require('./prompt-engine-contract')

describe('prompt-engine-contract 图片提示词统一契约', () => {
  it('平台/风格枚举与 prompt-engine models.py 一致（7 平台、14 风格）', () => {
    expect([...PROMPT_ENGINE_PLATFORMS].sort()).toEqual([
      'dalle', 'generic', 'jimeng', 'midjourney', 'stable_diffusion', 'tongyi', 'yizhang',
    ])
    expect([...PROMPT_ENGINE_STYLES].sort()).toEqual([
      '3d_render', 'abstract', 'anime', 'cartoon', 'cyberpunk', 'fantasy', 'landscape',
      'minimalist', 'oil_painting', 'photography', 'pixel', 'portrait', 'realistic', 'watercolor',
    ])
  })

  it('风格别名归一：cinematic/3d-render 映射为合法枚举，未知值回退 realistic', () => {
    expect(normalizePromptEngineStyle('cinematic')).toBe('photography')
    expect(normalizePromptEngineStyle('3d-render')).toBe('3d_render')
    expect(normalizePromptEngineStyle('3d_render')).toBe('3d_render')
    expect(normalizePromptEngineStyle('not-a-style')).toBe('realistic')
    expect(normalizePromptEngineStyle('')).toBe('realistic')
    expect(normalizePromptEngineStyle(null)).toBe('realistic')
  })

  it('平台别名归一：dall-e 系列 / stable-diffusion 系列 / 中文名映射，未知值回退 generic', () => {
    expect(normalizePromptEnginePlatform('dall-e')).toBe('dalle')
    expect(normalizePromptEnginePlatform('dall-e-2')).toBe('dalle')
    expect(normalizePromptEnginePlatform('dall-e-3')).toBe('dalle')
    expect(normalizePromptEnginePlatform('stable-diffusion')).toBe('stable_diffusion')
    expect(normalizePromptEnginePlatform('stable-diffusion-xl')).toBe('stable_diffusion')
    expect(normalizePromptEnginePlatform('sdxl')).toBe('stable_diffusion')
    expect(normalizePromptEnginePlatform('stability')).toBe('stable_diffusion')
    expect(normalizePromptEnginePlatform('通义万相')).toBe('tongyi')
    expect(normalizePromptEnginePlatform('文心一格')).toBe('yizhang')
    expect(normalizePromptEnginePlatform('即梦')).toBe('jimeng')
    expect(normalizePromptEnginePlatform('minimax')).toBe('generic')
    expect(normalizePromptEnginePlatform('')).toBe('generic')
  })

  it('请求构造：显式 style 归一发送；未指定且自动检测时省略 style；关闭检测时用默认风格', () => {
    const explicit = buildPromptEngineOptimizeRequest('cat', { style: 'cinematic', platform: 'dall-e', quality_baseline: false })
    expect(explicit).toMatchObject({ prompt: 'cat', platform: 'dalle', style: 'photography', auto_detect_style: true })

    const auto = buildPromptEngineOptimizeRequest('cat', { autoDetectStyle: true, quality_baseline: false })
    expect(auto).not.toHaveProperty('style')
    expect(auto).toMatchObject({ platform: 'generic', auto_detect_style: true })

    const manual = buildPromptEngineOptimizeRequest('cat', { autoDetectStyle: false, quality_baseline: false })
    expect(manual).toMatchObject({ style: 'realistic', auto_detect_style: false })
  })

  it('请求构造：创意度/长度/候选数收敛到契约边界，负向提示词截断，context 字符串转 synopsis', () => {
    const request = buildPromptEngineOptimizeRequest('x', {
      creative_level: 99,
      max_length: 10,
      num_candidates: 0,
      negative_prompt: ('bad text, watermark, extra fingers, ').repeat(30),
      context: '角色一致性',
      quality_baseline: false,
    })
    expect(request.creative_level).toBe(10)
    expect(request.max_length).toBe(PROMPT_ENGINE_LIMITS.maxLength.min)
    expect(request.num_candidates).toBe(1)
    expect(request.negative_prompt.length).toBe(500)
    expect(request.context).toEqual({ synopsis: '角色一致性' })
  })

  it('请求构造：无类别后缀的裸绝对否定词被 plausible-only 清理，请求不带 negative_prompt', () => {
    const request = buildPromptEngineOptimizeRequest('x', {
      negative_prompt: '不要坏, never bad, don\'t ugly',
      quality_baseline: false,
    })
    expect(request).not.toHaveProperty('negative_prompt')
  })

  it('输出校验：error 优先，失败兜底响应（原文+error）不被当成成功', () => {
    expect(extractOptimizedPrompt({ optimized_prompt: '原文', error: 'quota exceeded' }).ok).toBe(false)
    expect(extractOptimizedPrompt({ optimized_prompt: '原文', error: 'quota exceeded' }).error).toMatch(/quota exceeded/)
    expect(extractOptimizedPrompt({ detail: [{ msg: 'bad enum' }] }).error).toMatch(/422/)
    expect(extractOptimizedPrompt({ optimized_prompt: '   ' }).ok).toBe(false)
    expect(extractOptimizedPrompt(null).ok).toBe(false)
    expect(extractOptimizedPrompt('string').ok).toBe(false)
  })

  it('输出校验：成功结果透传元数据并保留 detected_categories / candidates', () => {
    const out = extractOptimizedPrompt({
      optimized_prompt: '  a nice prompt  ',
      platform: 'generic',
      style: 'photography',
      model_used: 'deepseek',
      key_source: 'config',
      detected_categories: { categories: ['lighting'] },
      candidates: ['a nice prompt'],
    })
    expect(out).toMatchObject({ ok: true, prompt: 'a nice prompt' })
    expect(out.meta).toMatchObject({
      platform: 'generic', style: 'photography', model_used: 'deepseek', key_source: 'config',
      detected_categories: { categories: ['lighting'] }, candidates: ['a nice prompt'],
    })
  })

  it('输出校验：超过 max_length 截断并标记 truncated，不失败', () => {
    const warn = vi.fn()
    const out = extractOptimizedPrompt({ optimized_prompt: 'x'.repeat(400) }, { maxLength: 300, warn })
    expect(out).toMatchObject({ ok: true, truncated: true, prompt: 'x'.repeat(300) })
    expect(warn).toHaveBeenCalledOnce()
  })
  it('context 对象含敏感凭据键时请求构造直接拒绝（防凭据外发，覆盖大小写/连字符变体）', () => {
    for (const bad of [
      { api_key: 'secret' },
      { nested: { token: 'x' } },
      { apiKey: 'secret' },
      { API_KEY: 'secret' },
      { 'api-key': 'secret' },
      { 'api key': 'secret' },
      { Authorization: 'Bearer x' },
      { clientSecret: 'x' },
    ]) {
      expect(() => buildPromptEngineOptimizeRequest('cat', { context: bad }))
        .toThrow(/敏感凭据/)
    }
    expect(() => buildPromptEngineOptimizeRequest('cat', { context: { synopsis: '角色', style: '写实' } }))
      .not.toThrow()
  })

  it('输出校验：error 为对象/非字符串、detail 为字符串同样按失败处理（宽判）', () => {
    expect(extractOptimizedPrompt({ optimized_prompt: '原文', error: { message: 'quota' } }).ok).toBe(false)
    expect(extractOptimizedPrompt({ optimized_prompt: '原文', error: ['e1'] }).ok).toBe(false)
    expect(extractOptimizedPrompt({ optimized_prompt: 'x', detail: 'string detail' }).error).toMatch(/422/)
    expect(extractOptimizedPrompt({ optimized_prompt: 'x', detail: 'string detail' }).error).toContain('string detail')
  })

  it('输出校验：超长截断按 Unicode 码点，不切断代理对', () => {
    const out = extractOptimizedPrompt({ optimized_prompt: '😀'.repeat(400) }, { maxLength: 300 })
    expect(out).toMatchObject({ ok: true, truncated: true })
    expect(Array.from(out.prompt)).toHaveLength(300)
    expect(out.prompt).toBe('😀'.repeat(300))
  })
})

describe('技术底座基线注入（Higgsfield 实证）', () => {
  it('IMAGE_QUALITY_BASELINE 常量 ≤200 字符且覆盖写实/摄影/灯光/色彩/皮肤/物理/禁文字段', () => {
    expect(IMAGE_QUALITY_BASELINE.length).toBeLessThanOrEqual(200)
    for (const kw of ['Photoreal', 'lighting', 'color ratio', 'skin', 'physical', 'no text', 'watermark']) {
      expect(IMAGE_QUALITY_BASELINE.toLowerCase()).toContain(kw.toLowerCase())
    }
  })

  it('默认注入：prompt 后置拼接基线片段，整体受 promptMax 截断保护', () => {
    const request = buildPromptEngineOptimizeRequest('cat', { style: 'anime' })
    expect(request.prompt).toContain(IMAGE_QUALITY_BASELINE)
    expect(request.prompt.startsWith('cat ')).toBe(true)

    const longPrompt = buildPromptEngineOptimizeRequest('c'.repeat(PROMPT_ENGINE_LIMITS.promptMax), {})
    expect(longPrompt.prompt.length).toBeLessThanOrEqual(PROMPT_ENGINE_LIMITS.promptMax)

    const emptyPrompt = buildPromptEngineOptimizeRequest('', {})
    expect(emptyPrompt.prompt).toBe(IMAGE_QUALITY_BASELINE)
  })

  it('显式关闭：options.quality_baseline=false 不注入，与现状行为一致', () => {
    const request = buildPromptEngineOptimizeRequest('cat', { quality_baseline: false })
    expect(request.prompt).toBe('cat')
  })
})

describe('精修层长度层级（creative_level ≥ 7）', () => {
  it('未显式传 max_length 且 creative_level ≥ 7 → 精修层默认（8013 能力上限 2000）', () => {
    expect(buildPromptEngineOptimizeRequest('x', { creative_level: 8, quality_baseline: false }).max_length).toBe(2000)
    expect(buildPromptEngineOptimizeRequest('x', { creative_level: 7, quality_baseline: false }).max_length).toBe(2000)
  })

  it('未显式 + 常规创意度 → 默认 500（现状不变）', () => {
    expect(buildPromptEngineOptimizeRequest('x', { creative_level: 5, quality_baseline: false }).max_length).toBe(500)
  })

  it('显式传值越界收敛到 [50, 2000]，不拒绝请求', () => {
    expect(buildPromptEngineOptimizeRequest('x', { creative_level: 8, max_length: 3000, quality_baseline: false }).max_length).toBe(2000)
    expect(buildPromptEngineOptimizeRequest('x', { creative_level: 8, max_length: 10, quality_baseline: false }).max_length).toBe(50)
  })
})

describe('context 白名单（synopsis/character/setting/character_list）', () => {
  it('白名单键随请求透传，未知键忽略并记录 warning', () => {
    const warns = []
    const request = buildPromptEngineOptimizeRequest('cat', {
      context: {
        synopsis: '梗概', character: { name: 'a' }, setting: '废墟', character_list: [{ name: 'b' }],
        style: '写实', evil_key: 1,
      },
      warn: (msg) => warns.push(msg),
      quality_baseline: false,
    })
    expect(request.context).toEqual({
      synopsis: '梗概', character: { name: 'a' }, setting: '废墟', character_list: [{ name: 'b' }],
    })
    expect(warns).toEqual(['optimize.context 忽略未知键: style', 'optimize.context 忽略未知键: evil_key'])
  })

  it('全未知键 → 不发送 context 字段', () => {
    const request = buildPromptEngineOptimizeRequest('cat', { context: { foo: 1 }, quality_baseline: false })
    expect(request).not.toHaveProperty('context')
  })

  it('无 warn 回调时未知键静默忽略（不抛错）', () => {
    expect(() => buildPromptEngineOptimizeRequest('cat', { context: { synopsis: 's', unknown: 2 }, quality_baseline: false }))
      .not.toThrow()
  })

  it('PROMPT_ENGINE_CONTEXT_KEYS 导出对齐外部引擎已知 7 键（含 full_text 角色一致性键）', () => {
    expect([...PROMPT_ENGINE_CONTEXT_KEYS].sort()).toEqual([
      'character', 'character_list', 'full_text', 'narrative_intent', 'scene_type', 'setting', 'synopsis',
    ])
  })

  it('full_text/narrative_intent/scene_type 随请求透传（story2video scene_context 依赖）', () => {
    const request = buildPromptEngineOptimizeRequest('cat', {
      context: { synopsis: 's', full_text: 'ft', narrative_intent: 'ni', scene_type: 'st' },
      quality_baseline: false,
    })
    expect(request.context).toEqual({ synopsis: 's', full_text: 'ft', narrative_intent: 'ni', scene_type: 'st' })
  })
})

describe('正向约束 meta 透传（positive_constraints）', () => {
  it('数组透传：非字符串元素丢弃，上限 10 条', () => {
    const out = extractOptimizedPrompt({
      optimized_prompt: 'x',
      positive_constraints: ['必须红衣', 1, null, { bad: true }, '必须持剑', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    })
    expect(out.ok).toBe(true)
    expect(out.meta.positive_constraints).toHaveLength(10)
    expect(out.meta.positive_constraints[0]).toBe('必须红衣')
    expect(out.meta.positive_constraints).not.toContain(1)
    expect(out.meta.positive_constraints).not.toContain(null)
  })

  it('字符串按换行/分号拆分后收敛', () => {
    const out = extractOptimizedPrompt({ optimized_prompt: 'x', positive_constraints: '甲\n乙;丙' })
    expect(out.meta.positive_constraints).toEqual(['甲', '乙', '丙'])
  })

  it('缺省零拒绝：8013 旧响应无该字段时 meta 不含键，结果正常', () => {
    const out = extractOptimizedPrompt({ optimized_prompt: 'x', platform: 'generic' })
    expect(out.ok).toBe(true)
    expect(out.meta).not.toHaveProperty('positive_constraints')
  })
})

describe('selectBestCandidate 多候选规则评估择优', () => {
  const source = 'warrior rides through ruined city at golden hour'

  it('选择四维规则评分最高候选（长度/六要素/保真/构图）', () => {
    const rich = 'A warrior riding a horse through a ruined city at golden hour, warm amber color palette, cinematic composition, dramatic golden lighting, epic fantasy style, dust and embers, low angle perspective, rule of thirds, depth of field, detailed armor, banner, ruined temple, volumetric light rays'
    const thin = 'a warrior'
    const best = selectBestCandidate([thin, rich], source)
    expect(best).not.toBeNull()
    expect(best.prompt).toBe(rich)
    expect(best.score).toBeGreaterThan(0)
  })

  it('tie-break：同分时保留最长候选（对齐既有「最长即最优」兜底）', () => {
    const a = 'a warrior, golden light, epic style, ruined city, dust'
    const b = a + ', additional detail, volumetric rays, low angle, rule of thirds'
    const best = selectBestCandidate([a, b], source)
    expect(best.prompt).toBe(b)
  })

  it('非数组 / 空数组 / 全空白 / 全非字符串 → null（未接入路径零回归）', () => {
    expect(selectBestCandidate(null, source)).toBeNull()
    expect(selectBestCandidate(undefined, source)).toBeNull()
    expect(selectBestCandidate([], source)).toBeNull()
    expect(selectBestCandidate(['  ', '\n'], source)).toBeNull()
    expect(selectBestCandidate([1, { x: 1 }], source)).toBeNull()
  })

  it('单候选直接返回（无评分开销语义：candidates 长度 ≤1 时调用方不择优）', () => {
    const best = selectBestCandidate(['only one'], source)
    expect(best.prompt).toBe('only one')
  })
})
