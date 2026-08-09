// @vitest-environment node
const {
  PROMPT_ENGINE_PLATFORMS,
  PROMPT_ENGINE_STYLES,
  normalizePromptEngineStyle,
  normalizePromptEnginePlatform,
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
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
    const explicit = buildPromptEngineOptimizeRequest('cat', { style: 'cinematic', platform: 'dall-e' })
    expect(explicit).toMatchObject({ prompt: 'cat', platform: 'dalle', style: 'photography', auto_detect_style: true })

    const auto = buildPromptEngineOptimizeRequest('cat', { autoDetectStyle: true })
    expect(auto).not.toHaveProperty('style')
    expect(auto).toMatchObject({ platform: 'generic', auto_detect_style: true })

    const manual = buildPromptEngineOptimizeRequest('cat', { autoDetectStyle: false })
    expect(manual).toMatchObject({ style: 'realistic', auto_detect_style: false })
  })

  it('请求构造：创意度/长度/候选数收敛到契约边界，负向提示词截断，context 字符串转 synopsis', () => {
    const request = buildPromptEngineOptimizeRequest('x', {
      creative_level: 99,
      max_length: 10,
      num_candidates: 0,
      negative_prompt: 'bad '.repeat(200),
      context: '角色一致性',
    })
    expect(request.creative_level).toBe(10)
    expect(request.max_length).toBe(PROMPT_ENGINE_LIMITS.maxLength.min)
    expect(request.num_candidates).toBe(1)
    expect(request.negative_prompt.length).toBe(500)
    expect(request.context).toEqual({ synopsis: '角色一致性' })
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
