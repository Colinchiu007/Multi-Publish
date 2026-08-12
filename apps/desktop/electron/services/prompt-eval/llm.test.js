// @ts-check
// @vitest-environment node
const {
  stripCodeFence,
  parseAndValidate,
  normalizeParsed,
} = require('./llm')

const VALID = {
  overall: 82,
  dimensions: [
    { id: 'relevance', score: 85, evidence: '主体与提示一致', issues: [], suggestions: [] },
    { id: 'content_accuracy', score: 80, evidence: '关键元素基本准确', issues: ['缺少道具'], suggestions: ['补充道具'] },
    { id: 'aesthetic_quality', score: 78, evidence: '构图合理', issues: [], suggestions: [] },
  ],
  problems: [
    { severity: 'major', category: 'content_missing', description: '缺少碗筷', promptPart: 'optimized_prompt', suggestion: '补充道具描述' },
  ],
  promptOptimizationPoints: [
    { type: 'add_specificity', target: 'optimized_prompt', suggestion: '补充碗筷细节' },
  ],
}

describe('prompt-eval llm', () => {
  it('stripCodeFence 剥除 ```json 代码块与首尾空白', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripCodeFence('  前缀 {"a":1} 后缀')).toBe('前缀 {"a":1} 后缀')
    expect(stripCodeFence(JSON.stringify(VALID))).toBe(JSON.stringify(VALID))
  })

  it('合法输出通过解析与校验（单图 3 维度）', () => {
    const result = parseAndValidate(JSON.stringify(VALID), { imageCount: 1 })
    expect(result.overall).toBe(82)
    expect(result.dimensions).toHaveLength(3)
    expect(result.problems).toHaveLength(1)
  })

  it('多图要求 4 维度，缺跨图维度 → EVAL_LLM_INVALID_RESPONSE', () => {
    expect(() => parseAndValidate(JSON.stringify(VALID), { imageCount: 2 }))
      .toThrow(/EVAL_LLM_INVALID_RESPONSE/)
  })

  it('非法 JSON → EVAL_LLM_INVALID_RESPONSE', () => {
    expect(() => parseAndValidate('not json', { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
    expect(() => parseAndValidate('', { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
  })

  it('overall 越界/非数字 → 失败', () => {
    expect(() => parseAndValidate(JSON.stringify({ ...VALID, overall: 101 }), { imageCount: 1 })).toThrow()
    expect(() => parseAndValidate(JSON.stringify({ ...VALID, overall: 'high' }), { imageCount: 1 })).toThrow()
  })

  it('维度分数越界/evidence 为空/未知 id → 失败', () => {
    const bad1 = { ...VALID, dimensions: [{ ...VALID.dimensions[0], score: -1 }] }
    expect(() => parseAndValidate(JSON.stringify(bad1), { imageCount: 1 })).toThrow()
    const bad2 = { ...VALID, dimensions: [{ ...VALID.dimensions[0], evidence: '  ' }] }
    expect(() => parseAndValidate(JSON.stringify(bad2), { imageCount: 1 })).toThrow()
    const bad3 = { ...VALID, dimensions: [{ ...VALID.dimensions[0], id: 'nope' }] }
    expect(() => parseAndValidate(JSON.stringify(bad3), { imageCount: 1 })).toThrow()
  })

  it('problems/优化点白名单外值 → 失败', () => {
    const badSev = { ...VALID, problems: [{ ...VALID.problems[0], severity: 'fatal' }] }
    expect(() => parseAndValidate(JSON.stringify(badSev), { imageCount: 1 })).toThrow()
    const badCat = { ...VALID, problems: [{ ...VALID.problems[0], category: 'x' }] }
    expect(() => parseAndValidate(JSON.stringify(badCat), { imageCount: 1 })).toThrow()
    const badPt = { ...VALID, promptOptimizationPoints: [{ ...VALID.promptOptimizationPoints[0], type: 'x' }] }
    expect(() => parseAndValidate(JSON.stringify(badPt), { imageCount: 1 })).toThrow()
  })

  it('normalizeParsed 计算总体分与等级，overall 与加权偏差 >10 标记 mismatch', () => {
    const parsed = normalizeParsed(JSON.parse(JSON.stringify(VALID)), { imageCount: 1 })
    expect(parsed.grade).toBe('good')
    expect(parsed.overallMismatch).toBe(false)
    const far = normalizeParsed(JSON.parse(JSON.stringify({ ...VALID, overall: 95 })), { imageCount: 1 })
    expect(far.overallMismatch).toBe(true)
  })
  it('problems / promptOptimizationPoints 缺失或非数组 → fail closed', () => {
    const noProblems = { ...VALID }; delete noProblems.problems
    expect(() => parseAndValidate(JSON.stringify(noProblems), { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
    const badProblems = { ...VALID, problems: 'none' }
    expect(() => parseAndValidate(JSON.stringify(badProblems), { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
    const noPoints = { ...VALID }; delete noPoints.promptOptimizationPoints
    expect(() => parseAndValidate(JSON.stringify(noPoints), { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
    const badPoints = { ...VALID, promptOptimizationPoints: 42 }
    expect(() => parseAndValidate(JSON.stringify(badPoints), { imageCount: 1 })).toThrow(/EVAL_LLM_INVALID_RESPONSE/)
  })
})
