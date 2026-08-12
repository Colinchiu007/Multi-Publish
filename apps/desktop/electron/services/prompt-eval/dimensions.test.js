// @ts-check
// @vitest-environment node
const {
  IMAGE_DIMENSIONS,
  VIDEO_DIMENSIONS,
  resolveDimensionWeights,
  gradeForScore,
  PROBLEM_CATEGORIES,
  PROMPT_PART_VALUES,
  OPTIMIZATION_POINT_TYPES,
  SEVERITIES,
  assertProblemValid,
  assertOptimizationPointValid,
} = require('./dimensions')

describe('prompt-eval dimensions', () => {
  it('IMAGE_DIMENSIONS 定义 4 个维度与权重 0.30/0.30/0.20/0.20', () => {
    expect(IMAGE_DIMENSIONS.map(d => d.id)).toEqual([
      'relevance', 'content_accuracy', 'aesthetic_quality', 'cross_image_consistency',
    ])
    expect(IMAGE_DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 5)
  })

  it('VIDEO_DIMENSIONS 为占位且含 4 个预留维度（v2 实现）', () => {
    expect(VIDEO_DIMENSIONS.map(d => d.id)).toEqual([
      'temporal_consistency', 'motion_accuracy', 'audio_visual_sync', 'video_aesthetic_quality',
    ])
  })

  it('单图权重归一化为 0.375/0.375/0.25 且不含跨图维度', () => {
    const weights = resolveDimensionWeights(1)
    expect(weights).toHaveLength(3)
    expect(weights.find(w => w.id === 'cross_image_consistency')).toBeUndefined()
    expect(weights.find(w => w.id === 'relevance').weight).toBeCloseTo(0.375, 5)
    expect(weights.find(w => w.id === 'content_accuracy').weight).toBeCloseTo(0.375, 5)
    expect(weights.find(w => w.id === 'aesthetic_quality').weight).toBeCloseTo(0.25, 5)
    expect(weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 5)
  })

  it('多图（2 张）使用完整四维权重', () => {
    const weights = resolveDimensionWeights(2)
    expect(weights).toHaveLength(4)
    expect(weights.find(w => w.id === 'cross_image_consistency').weight).toBeCloseTo(0.2, 5)
  })

  it('非法图片数（0/负数）收敛为单图权重', () => {
    expect(resolveDimensionWeights(0).map(w => w.id)).toEqual(['relevance', 'content_accuracy', 'aesthetic_quality'])
    expect(resolveDimensionWeights(-1).map(w => w.id)).toEqual(['relevance', 'content_accuracy', 'aesthetic_quality'])
  })

  it('等级边界：84→良好 85→优秀 69→一般 70→良好 49→差 50→一般', () => {
    expect(gradeForScore(100)).toBe('excellent')
    expect(gradeForScore(85)).toBe('excellent')
    expect(gradeForScore(84)).toBe('good')
    expect(gradeForScore(70)).toBe('good')
    expect(gradeForScore(69)).toBe('fair')
    expect(gradeForScore(50)).toBe('fair')
    expect(gradeForScore(49)).toBe('poor')
    expect(gradeForScore(0)).toBe('poor')
  })

  it('非法分数（越界/非数字/NaN）抛错', () => {
    expect(() => gradeForScore(-1)).toThrow()
    expect(() => gradeForScore(101)).toThrow()
    expect(() => gradeForScore('85')).toThrow()
    expect(() => gradeForScore(NaN)).toThrow()
  })

  it('白名单：问题类别 11 类、归因 5 类、优化点 7 类、严重度 3 类', () => {
    expect(PROBLEM_CATEGORIES).toHaveLength(11)
    expect(PROMPT_PART_VALUES).toHaveLength(5)
    expect(OPTIMIZATION_POINT_TYPES).toHaveLength(7)
    expect(SEVERITIES).toEqual(['critical', 'major', 'minor'])
  })

  it('assertProblemValid 接受合法项并拒绝非法项', () => {
    const valid = { severity: 'major', category: 'content_wrong', description: '主体缺失', promptPart: 'optimized_prompt', suggestion: '补细节' }
    expect(() => assertProblemValid(valid)).not.toThrow()
    for (const bad of [
      { ...valid, severity: 'fatal' },
      { ...valid, category: 'nope' },
      { ...valid, description: '' },
      { ...valid, promptPart: 'image' },
    ]) {
      expect(() => assertProblemValid(bad)).toThrow()
    }
  })

  it('assertOptimizationPointValid 接受合法项并拒绝非法项', () => {
    const valid = { type: 'add_specificity', target: 'optimized_prompt', suggestion: '补充主体细节' }
    expect(() => assertOptimizationPointValid(valid)).not.toThrow()
    expect(() => assertOptimizationPointValid({ ...valid, type: 'nope' })).toThrow()
    expect(() => assertOptimizationPointValid({ ...valid, suggestion: '' })).toThrow()
  })
})

