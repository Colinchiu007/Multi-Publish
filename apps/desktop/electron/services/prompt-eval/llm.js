// @ts-check
/**
 * 评估 LLM 输出解析与契约校验（fail closed）
 * 任何非法结构 → 抛 EVAL_LLM_INVALID_RESPONSE，绝不静默降级。
 */
const {
  IMAGE_DIMENSIONS,
  CROSS_IMAGE_ID,
  resolveDimensionWeights,
  gradeForScore,
  assertProblemValid,
  assertOptimizationPointValid,
} = require('./dimensions')

const ALLOWED_DIMENSION_IDS = new Set(IMAGE_DIMENSIONS.map(d => d.id))

function stripCodeFence (raw) {
  if (typeof raw !== 'string') return ''
  let out = raw.trim()
  const fence = out.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/)
  if (fence) out = fence[1].trim()
  return out
}

function parseJson (raw) {
  const cleaned = stripCodeFence(raw)
  if (!cleaned) throw new Error('EVAL_LLM_INVALID_RESPONSE: evaluator returned empty output')
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    const error = new Error('EVAL_LLM_INVALID_RESPONSE: evaluator output is not valid JSON: ' + (e && e.message ? e.message : String(e)))
    error.details = { rawPreview: cleaned.slice(0, 200) }
    throw error
  }
}

/**
 * 严格校验并归一化评估器输出。
 * @param {string} raw
 * @param {{ imageCount: number }} ctx
 * @returns {{ overall: number, dimensions: Array, problems: Array, promptOptimizationPoints: Array }}
 */
function parseAndValidate (raw, ctx) {
  try {
    return parseAndValidateInner(raw, ctx)
  } catch (e) {
    // 所有契约错误统一携带 code，供上层精确映射（不误报 EVAL_INTERNAL）
    if (e && typeof e === 'object' && !e.code) e.code = 'EVAL_LLM_INVALID_RESPONSE'
    throw e
  }
}

function parseAndValidateInner (raw, ctx) {
  const parsed = parseJson(raw)
  const imageCount = Number.isInteger(ctx && ctx.imageCount) && ctx.imageCount >= 2 ? ctx.imageCount : 1
  const expectedIds = resolveDimensionWeights(imageCount).map(d => d.id)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: evaluator output must be a JSON object')
  }
  if (!Number.isFinite(parsed.overall)) throw new Error('EVAL_LLM_INVALID_RESPONSE: overall must be a number')
  const overall = Math.round(parsed.overall)
  if (overall < 0 || overall > 100) throw new Error('EVAL_LLM_INVALID_RESPONSE: overall out of range 0..100')

  if (!Array.isArray(parsed.dimensions)) throw new Error('EVAL_LLM_INVALID_RESPONSE: dimensions must be an array')
  const seen = new Set()
  for (const dim of parsed.dimensions) {
    if (!dim || typeof dim !== 'object') throw new Error('EVAL_LLM_INVALID_RESPONSE: dimension must be an object')
    if (!ALLOWED_DIMENSION_IDS.has(dim.id)) throw new Error('EVAL_LLM_INVALID_RESPONSE: unknown dimension id: ' + dim.id)
    if (seen.has(dim.id)) throw new Error('EVAL_LLM_INVALID_RESPONSE: duplicate dimension id: ' + dim.id)
    seen.add(dim.id)
    if (!Number.isFinite(dim.score) || Math.round(dim.score) < 0 || Math.round(dim.score) > 100) {
      throw new Error('EVAL_LLM_INVALID_RESPONSE: dimension score out of range for ' + dim.id)
    }
    if (typeof dim.evidence !== 'string' || !dim.evidence.trim()) {
      throw new Error('EVAL_LLM_INVALID_RESPONSE: dimension evidence must be a non-empty string for ' + dim.id)
    }
    for (const key of ['issues', 'suggestions']) {
      if (dim[key] !== undefined && dim[key] !== null && !Array.isArray(dim[key])) {
        throw new Error('EVAL_LLM_INVALID_RESPONSE: dimension ' + key + ' must be an array for ' + dim.id)
      }
    }
  }
  for (const id of expectedIds) {
    if (!seen.has(id)) throw new Error('EVAL_LLM_INVALID_RESPONSE: missing dimension id: ' + id)
  }
  if (seen.size !== expectedIds.length) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: unexpected extra dimensions')
  }

  // fail closed：problems / promptOptimizationPoints 键缺失或非数组 → 整次失败（不允许静默降级为空）
  if (!('problems' in parsed) || !Array.isArray(parsed.problems)) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: problems must be an array')
  }
  if (!('promptOptimizationPoints' in parsed) || !Array.isArray(parsed.promptOptimizationPoints)) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: promptOptimizationPoints must be an array')
  }
  const problems = parsed.problems
  for (const p of problems) assertProblemValid(p)
  const points = parsed.promptOptimizationPoints
  for (const p of points) assertOptimizationPointValid(p)

  return {
    overall,
    dimensions: parsed.dimensions.map(d => ({
      id: d.id,
      score: Math.round(d.score),
      evidence: d.evidence,
      issues: Array.isArray(d.issues) ? d.issues : [],
      suggestions: Array.isArray(d.suggestions) ? d.suggestions : [],
    })),
    problems,
    promptOptimizationPoints: points.map(p => ({
      type: p.type,
      target: typeof p.target === 'string' && p.target ? p.target : 'optimized_prompt',
      suggestion: p.suggestion,
    })),
  }
}

/**
 * 计算加权总体分、等级、与 LLM overall 的偏差标记。
 * @param {ReturnType<typeof parseAndValidate>} parsed
 * @param {{ imageCount: number }} ctx
 */
function normalizeParsed (parsed, ctx) {
  const imageCount = Number.isInteger(ctx && ctx.imageCount) && ctx.imageCount >= 2 ? ctx.imageCount : 1
  const weights = resolveDimensionWeights(imageCount)
  const byId = new Map(parsed.dimensions.map(d => [d.id, d]))
  let weighted = 0
  for (const w of weights) {
    const dim = byId.get(w.id)
    if (!dim) throw new Error('EVAL_LLM_INVALID_RESPONSE: missing dimension for weighted score: ' + w.id)
    weighted += dim.score * w.weight
  }
  const weightedScore = Math.round(weighted)
  const mismatch = Math.abs(parsed.overall - weightedScore) > 10
  return {
    ...parsed,
    weightedScore,
    overall: parsed.overall,
    overallMismatch: mismatch,
    grade: gradeForScore(parsed.overall),
    dimensionsWithCrossImage: imageCount >= 2,
  }
}

module.exports = {
  stripCodeFence,
  parseAndValidate,
  normalizeParsed,
  CROSS_IMAGE_ID,
}


