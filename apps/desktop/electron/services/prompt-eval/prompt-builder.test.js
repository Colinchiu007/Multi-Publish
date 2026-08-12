// @ts-check
// @vitest-environment node
const {
  buildImageEvaluationPrompt,
  buildVideoEvaluationPrompt,
  normalizeContextSnapshot,
} = require('./prompt-builder')

function items (overrides = {}) {
  return [{
    sourceText: '一个老妇人在做饭',
    context: { synopsis: '唐代中国的民间故事' },
    optimizedPrompt: '写实风格，一位穿唐代襦裙的老妇人在土灶前用柴火做饭',
    negativePrompt: '现代电器, 英文文字',
    imageIndex: 0,
    ...overrides,
  }]
}

describe('prompt-eval prompt-builder', () => {
  it('构造的提示词包含角色/任务/输入快照/评分标准/JSON 契约', () => {
    const p = buildImageEvaluationPrompt({ items: items(), imageCount: 1 }).prompt
    expect(p).toContain('AI 生成图像评估专家')
    expect(p).toContain('一个老妇人在做饭')
    expect(p).toContain('唐代中国的民间故事')
    expect(p).toContain('写实风格，一位穿唐代襦裙的老妇人在土灶前用柴火做饭')
    expect(p).toContain('现代电器, 英文文字')
    expect(p).toContain('relevance')
    expect(p).toContain('content_accuracy')
    expect(p).toContain('aesthetic_quality')
    expect(p).toContain('promptOptimizationPoints')
  })

  it('单图不包含跨图一致性评分标准，且契约维度无 cross_image_consistency', () => {
    const p = buildImageEvaluationPrompt({ items: items(), imageCount: 1 }).prompt
    expect(p).not.toContain('cross_image_consistency')
  })

  it('多图（≥2）包含跨图一致性评分标准与每项输入快照（不替换上下文为占位符）', () => {
    const multi = [
      items()[0],
      { sourceText: '老妇人在庭院', context: { synopsis: '唐代中国' }, optimizedPrompt: '庭院中的老妇人', negativePrompt: '', imageIndex: 1 },
    ]
    const p = buildImageEvaluationPrompt({ items: multi, imageCount: 2 }).prompt
    expect(p).toContain('cross_image_consistency')
    expect(p).toContain('### 图片 0')
    expect(p).toContain('### 图片 1')
    expect(p).toContain('老妇人在庭院')
    expect(p).toContain('唐代中国')
    expect(p).toContain('庭院中的老妇人')
  })

  it('context 字符串归一为 { synopsis }，缺省字段补空并保留 JSON 键', () => {
    const p = buildImageEvaluationPrompt({ items: items({ context: '全文背景文字' }), imageCount: 1 }).prompt
    expect(p).toContain('全文背景文字')
    const p2 = buildImageEvaluationPrompt({ items: items({ context: null, negativePrompt: '' }), imageCount: 1 }).prompt
    expect(p2).toContain('文案上下文：')
    expect(p2).toContain('负向提示：')
  })

  it('超长输入被裁剪并标记 truncated', () => {
    const longText = '字'.repeat(12000)
    const r = buildImageEvaluationPrompt({ items: items({ sourceText: longText, optimizedPrompt: longText }), imageCount: 1 })
    expect(r.prompt.length).toBeLessThan(22000)
    expect(r.truncated).toBe(true)
    expect(r.prompt).not.toContain(longText)
  })

  it('视频提示词构造抛 EVAL_MEDIA_TYPE_NOT_SUPPORTED', () => {
    expect(() => buildVideoEvaluationPrompt()).toThrow(/EVAL_MEDIA_TYPE_NOT_SUPPORTED|视频评估暂未实现/)
  })

  it('normalizeContextSnapshot：字符串→对象、空→null、嵌套敏感键被递归剔除并记录路径', () => {
    expect(normalizeContextSnapshot('abc').snapshot).toEqual({ synopsis: 'abc' })
    expect(normalizeContextSnapshot('').snapshot).toBeNull()
    expect(normalizeContextSnapshot(undefined).snapshot).toBeNull()
    const r = normalizeContextSnapshot({ synopsis: 's', password: 'x', profile: { api_key: 'sk-1', name: 'n' } })
    expect(r.snapshot).toEqual({ synopsis: 's', profile: { name: 'n' } })
    expect(r.sanitizedKeys).toEqual(['password', 'profile.api_key'])
  })
})
