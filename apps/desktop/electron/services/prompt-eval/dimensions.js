// @ts-check
/**
 * 提示词评估维度注册表（PromptEval）
 * v1：图片模式 4 维度；视频模式为占位（v2 实现）
 * 分数规则：0-100 整数；等级 ≥85 优秀 / ≥70 良好 / ≥50 一般 / <50 差
 */

const IMAGE_DIMENSIONS = [
  { id: 'relevance', label: '提示-输出关联度', weight: 0.30 },
  { id: 'content_accuracy', label: '内容准确性', weight: 0.30 },
  { id: 'aesthetic_quality', label: '视觉审美质量', weight: 0.20 },
  { id: 'cross_image_consistency', label: '跨图上下文一致性', weight: 0.20 },
]

// 视频评估预留维度（v2 实现，v1 仅文档级占位）
const VIDEO_DIMENSIONS = [
  { id: 'temporal_consistency', label: '时序一致性', weight: 0.30 },
  { id: 'motion_accuracy', label: '运动准确性', weight: 0.30 },
  { id: 'audio_visual_sync', label: '音画同步', weight: 0.20 },
  { id: 'video_aesthetic_quality', label: '视频审美质量', weight: 0.20 },
]

const CROSS_IMAGE_ID = 'cross_image_consistency'

/**
 * 根据图片数解析参与维度与权重。
 * 单图（<2）时跨图一致性不参与，权重归一化为 0.375/0.375/0.25。
 * @param {number} imageCount
 * @returns {{ id: string, label: string, weight: number }[]}
 */
function resolveDimensionWeights (imageCount) {
  const count = Number.isInteger(imageCount) && imageCount >= 2 ? imageCount : 1
  const dims = count >= 2 ? IMAGE_DIMENSIONS : IMAGE_DIMENSIONS.filter(d => d.id !== CROSS_IMAGE_ID)
  const total = dims.reduce((s, d) => s + d.weight, 0)
  return dims.map(d => ({ ...d, weight: Number((d.weight / total).toFixed(5)) }))
}

/**
 * 0-100 整数 → 等级
 * @param {number} score
 * @returns {'excellent'|'good'|'fair'|'poor'}
 */
function gradeForScore (score) {
  if (!Number.isFinite(score)) throw new Error('EVAL_LLM_INVALID_RESPONSE: score must be a finite number')
  const s = Math.round(score)
  if (s < 0 || s > 100) throw new Error('EVAL_LLM_INVALID_RESPONSE: score out of range 0..100')
  if (s >= 85) return 'excellent'
  if (s >= 70) return 'good'
  if (s >= 50) return 'fair'
  return 'poor'
}

const PROBLEM_CATEGORIES = [
  'content_missing',
  'content_wrong',
  'style_deviation',
  'layout_composition',
  'color_lighting',
  'text_rendering',
  'ambiguity',
  'context_loss',
  'consistency_break',
  'quality_defect',
  'unknown',
]

const PROMPT_PART_VALUES = [
  'source_text',
  'context',
  'optimized_prompt',
  'negative_prompt',
  'unknown',
]

const OPTIMIZATION_POINT_TYPES = [
  'add_specificity',
  'resolve_ambiguity',
  'enforce_style',
  'align_context',
  'add_negative',
  'structure_ordering',
  'consistency_anchor',
]

const SEVERITIES = ['critical', 'major', 'minor']

function assertProblemValid (problem) {
  if (!problem || typeof problem !== 'object') throw new Error('EVAL_LLM_INVALID_RESPONSE: problem must be an object')
  if (!SEVERITIES.includes(problem.severity)) throw new Error('EVAL_LLM_INVALID_RESPONSE: invalid problem.severity')
  if (!PROBLEM_CATEGORIES.includes(problem.category)) throw new Error('EVAL_LLM_INVALID_RESPONSE: invalid problem.category')
  if (typeof problem.description !== 'string' || !problem.description.trim()) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: problem.description must be a non-empty string')
  }
  if (typeof problem.promptPart !== 'string' || !PROMPT_PART_VALUES.includes(problem.promptPart)) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: invalid problem.promptPart')
  }
  if (problem.suggestion !== undefined && problem.suggestion !== null &&
      (typeof problem.suggestion !== 'string' || !problem.suggestion.trim())) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: problem.suggestion must be a non-empty string')
  }
}

function assertOptimizationPointValid (point) {
  if (!point || typeof point !== 'object') throw new Error('EVAL_LLM_INVALID_RESPONSE: optimization point must be an object')
  if (!OPTIMIZATION_POINT_TYPES.includes(point.type)) throw new Error('EVAL_LLM_INVALID_RESPONSE: invalid optimization point type')
  if (typeof point.suggestion !== 'string' || !point.suggestion.trim()) {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: optimization point suggestion must be a non-empty string')
  }
  if (point.target !== undefined && point.target !== null && typeof point.target !== 'string') {
    throw new Error('EVAL_LLM_INVALID_RESPONSE: optimization point target must be a string')
  }
}

module.exports = {
  IMAGE_DIMENSIONS,
  VIDEO_DIMENSIONS,
  CROSS_IMAGE_ID,
  resolveDimensionWeights,
  gradeForScore,
  PROBLEM_CATEGORIES,
  PROMPT_PART_VALUES,
  OPTIMIZATION_POINT_TYPES,
  SEVERITIES,
  assertProblemValid,
  assertOptimizationPointValid,
}
