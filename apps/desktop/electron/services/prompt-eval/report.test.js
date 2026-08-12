// @ts-check
// @vitest-environment node
const { buildRecord, toMarkdown, aggregate } = require('./report')

function sampleInput () {
  return {
    mediaType: 'image',
    items: [
      { imagePath: '/tmp/a.png', sourceText: '老妇人在做饭', context: { synopsis: '唐代中国' }, optimizedPrompt: '写实唐代老妇人做饭', negativePrompt: '', imageIndex: 0 },
      { imagePath: '/tmp/b.png', sourceText: '老妇人在庭院', context: { synopsis: '唐代中国' }, optimizedPrompt: '写实唐代老妇人庭院', negativePrompt: '', imageIndex: 1 },
    ],
    options: { language: 'zh', temperature: 0 },
  }
}

function sampleParsed () {
  return {
    overall: 78,
    weightedScore: 76,
    grade: 'good',
    overallMismatch: false,
    dimensionsWithCrossImage: true,
    dimensions: [
      { id: 'relevance', score: 80, evidence: '整体吻合', issues: [], suggestions: ['更贴切'] },
      { id: 'content_accuracy', score: 75, evidence: '主体正确', issues: ['缺碗筷'], suggestions: ['补碗筷'] },
      { id: 'aesthetic_quality', score: 77, evidence: '构图不错', issues: [], suggestions: [] },
      { id: 'cross_image_consistency', score: 72, evidence: '风格基本一致', issues: ['色调有差异'], suggestions: ['统一色调'] },
    ],
    problems: [
      { severity: 'major', category: 'content_missing', description: '缺少碗筷', promptPart: 'optimized_prompt', suggestion: '补充道具' },
    ],
    promptOptimizationPoints: [
      { type: 'add_specificity', target: 'optimized_prompt', suggestion: '补充碗筷细节' },
    ],
  }
}

describe('prompt-eval report', () => {
  it('buildRecord 组装完整记录（含输入快照、evaluatorModel、truncated 标记）', () => {
    const record = buildRecord({ input: sampleInput(), parsed: sampleParsed(), meta: { id: 'eval-1', evaluatorModel: 'mock-vision', truncated: true, sanitizedKeys: ['token'] } })
    expect(record.id).toBe('eval-1')
    expect(record.mediaType).toBe('image')
    expect(record.overallScore).toBe(78)
    expect(record.grade).toBe('good')
    expect(record.evaluatorModel).toBe('mock-vision')
    expect(record.inputSnapshot.items).toHaveLength(2)
    expect(record.inputSnapshot.items[0].optimizedPrompt).toContain('唐代老妇人做饭')
    expect(record.truncated).toBe(true)
    expect(record.sanitizedKeys).toEqual(['token'])
    expect(record.dimensions).toHaveLength(4)
  })

  it('toMarkdown 生成包含总分/维度/问题/优化点/输入快照的中文报告', () => {
    const record = buildRecord({ input: sampleInput(), parsed: sampleParsed(), meta: { id: 'eval-1' } })
    const md = toMarkdown(record)
    expect(md).toContain('# 提示词评估报告')
    expect(md).toContain('总体分：78')
    expect(md).toContain('关联度')
    expect(md).toContain('跨图上下文一致性')
    expect(md).toContain('content_missing')
    expect(md).toContain('add_specificity')
    expect(md).toContain('唐代老妇人做饭')
  })

  it('aggregate 输出记录数/平均分/等级分布/维度均值/问题分布/优化点汇总/推荐', () => {
    const r1 = buildRecord({ input: sampleInput(), parsed: sampleParsed(), meta: { id: 'eval-1' } })
    const r2 = buildRecord({ input: sampleInput(), parsed: { ...sampleParsed(), overall: 90, weightedScore: 90, grade: 'excellent', dimensions: sampleParsed().dimensions.map(d => ({ ...d, score: d.score + 15 })) }, meta: { id: 'eval-2' } })
    const agg = aggregate([r1, r2])
    expect(agg.recordCount).toBe(2)
    expect(agg.averageOverall).toBe(84)
    expect(agg.gradeDistribution.good).toBe(1)
    expect(agg.gradeDistribution.excellent).toBe(1)
    const relevance = agg.dimensionAverages.find(d => d.id === 'relevance')
    expect(relevance.average).toBeCloseTo(87.5, 5)
    const cat = agg.problemCategories.find(c => c.category === 'content_missing')
    expect(cat.count).toBe(2)
    const pt = agg.optimizationPoints.find(p => p.type === 'add_specificity')
    expect(pt.count).toBe(2)
    expect(pt.examples.length).toBeGreaterThan(0)
    expect(agg.recommendations.length).toBeGreaterThan(0)
  })

  it('aggregate 空数组返回零值结构', () => {
    const agg = aggregate([])
    expect(agg.recordCount).toBe(0)
    expect(agg.averageOverall).toBe(0)
    expect(agg.recommendations).toEqual([])
  })
})
