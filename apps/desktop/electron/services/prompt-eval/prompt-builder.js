// @ts-check
/**
 * 评估提示词构造（PromptEval）
 * 单源：评估提示词全文只在本模块维护，PRD 文档同步。
 * v1 图片模式；视频模式占位（抛 EVAL_MEDIA_TYPE_NOT_SUPPORTED）。
 * 安全：敏感键递归过滤；输入快照逐项输出（多图保留每项上下文，不做占位替换）。
 */

const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'api_key', 'apikey', 'credential', 'credentials', 'authorization', 'cookie', 'cookies',
]

const MAX_SNAPSHOT_CHARS = 6000

/**
 * 递归过滤敏感键（任意嵌套深度），返回 { snapshot, sanitizedKeys }。
 * @param {any} value
 * @param {string} [prefix]
 * @param {string[]} [sanitizedKeys]
 * @returns {any}
 */
function filterSensitiveDeep (value, prefix, sanitizedKeys) {
  if (Array.isArray(value)) {
    const out = []
    for (let i = 0; i < value.length; i++) {
      const p = prefix ? prefix + '[' + i + ']' : String(i)
      const v = value[i]
      if (v !== null && typeof v === 'object') out.push(filterSensitiveDeep(v, p, sanitizedKeys))
      else out.push(v)
    }
    return out
  }
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const p = prefix ? prefix + '.' + k : k
      if (SENSITIVE_KEYS.some(key => k.toLowerCase().includes(key))) {
        sanitizedKeys.push(p)
        continue
      }
      out[k] = (v !== null && typeof v === 'object') ? filterSensitiveDeep(v, p, sanitizedKeys) : v
    }
    return out
  }
  return value
}

/**
 * 上下文快照归一化：字符串→{ synopsis }；空→null；对象→递归敏感键过滤。
 * @param {any} context
 * @returns {{ snapshot: object|null, sanitizedKeys: string[] }}
 */
function normalizeContextSnapshot (context) {
  if (context === null || context === undefined || context === '') return { snapshot: null, sanitizedKeys: [] }
  if (typeof context === 'string') return { snapshot: { synopsis: context }, sanitizedKeys: [] }
  if (typeof context !== 'object' || Array.isArray(context)) return { snapshot: null, sanitizedKeys: [] }
  const sanitizedKeys = []
  const snapshot = filterSensitiveDeep(context, '', sanitizedKeys)
  return { snapshot, sanitizedKeys }
}

function truncate (text, max) {
  const s = typeof text === 'string' ? text : ''
  if (s.length <= max) return { value: s, truncated: false }
  return { value: s.slice(0, max), truncated: true }
}

function snapshotJson (value) {
  if (value === null || value === undefined) return '（未提供）'
  const s = JSON.stringify(value)
  if (!s) return '（未提供）'
  return s.length > MAX_SNAPSHOT_CHARS ? s.slice(0, MAX_SNAPSHOT_CHARS) : s
}

/**
 * 构建图片评估提示词
 * @param {object} input
 * @param {Array<{sourceText: string, context: any, optimizedPrompt: string, negativePrompt?: string, imageIndex: number}>} input.items
 * @param {number} input.imageCount
 * @param {'zh'|'en'} [input.language]
 * @returns {{ prompt: string, truncated: boolean, sanitizedKeys: string[] }}
 */
function buildImageEvaluationPrompt (input) {
  const items = Array.isArray(input.items) ? input.items : []
  const imageCount = Number.isInteger(input.imageCount) && input.imageCount >= 2 ? input.imageCount : Math.max(1, items.length)
  const sanitizedKeys = []
  for (const item of items) {
    const r = normalizeContextSnapshot(item.context)
    if (r.sanitizedKeys.length > 0) sanitizedKeys.push(...r.sanitizedKeys.map(k => 'item[' + item.imageIndex + '].context.' + k))
  }

  const snapshotBlocks = items.map((item, i) => {
    const ctx = snapshotJson(item.context)
    return [
      '### 图片 ' + (typeof item.imageIndex === 'number' ? item.imageIndex : i),
      '- 原始文案：' + truncate(item.sourceText || '', MAX_SNAPSHOT_CHARS).value,
      '- 文案上下文：' + ctx,
      '- 优化后的提示词：' + truncate(item.optimizedPrompt || '', MAX_SNAPSHOT_CHARS).value,
      '- 负向提示：' + truncate(item.negativePrompt || '（未提供）', MAX_SNAPSHOT_CHARS).value,
    ].join('\n')
  })

  const truncated = items.some(item => {
    return truncate(item.sourceText || '', MAX_SNAPSHOT_CHARS).truncated ||
      truncate(item.optimizedPrompt || '', MAX_SNAPSHOT_CHARS).truncated ||
      truncate(item.negativePrompt || '', MAX_SNAPSHOT_CHARS).truncated
  })

  const crossImageBlock = imageCount >= 2
    ? '4. cross_image_consistency 跨图上下文一致性（权重 20%，仅多图）：同一文案的多张图片之间角色外观、视觉风格、色调/氛围、场景衔接是否连续一致。'
    : '3. 跨图一致性不参与（仅单图评估，无需输出该维度）。'
  const dimensionIds = imageCount >= 2
    ? '"relevance|content_accuracy|aesthetic_quality|cross_image_consistency"'
    : '"relevance|content_accuracy|aesthetic_quality"'

  const prompt = [
    '【角色】你是专业的 AI 生成图像评估专家。你负责评估「提示词优化引擎」的输出效果：给定原始文案、整个文案上下文、优化后的提示词（以及负向提示）和生成的图片，你需要给出客观、严格、可复核的评估结果。',
    '',
    '【任务】逐维度评估图片，并输出严格 JSON（不要输出任何 JSON 以外的文字，不要使用代码块包裹）。',
    '',
    '【输入快照】',
    ...snapshotBlocks,
    '',
    '【评分标准】（每个维度 0-100 整数）',
    '1. relevance 提示-输出关联度（权重 30%）：图片与「原始文案+上下文+优化后提示词」整体语义的吻合程度。',
    '2. content_accuracy 内容准确性（权重 30%）：关键元素（主体/动作/场景/数量/风格/色彩/文字/道具）是否准确呈现，是否出现幻觉或缺失。',
    '3. aesthetic_quality 视觉审美质量（权重 20%）：构图、光影、色彩和谐、清晰度、细节质量、风格执行度。',
    crossImageBlock,
    '',
    '【输出 JSON 契约】',
    '{',
    '  "overall": 0-100整数,',
    '  "dimensions": [',
    '    { "id": ' + dimensionIds + ',',
    '      "score": 0-100整数,',
    '      "evidence": "基于图片事实的评分依据（非空字符串）",',
    '      "issues": ["该维度发现的问题"],',
    '      "suggestions": ["该维度的改进建议"] }',
    '  ],',
    '  "problems": [',
    '    { "severity": "critical|major|minor",',
    '      "category": "content_missing|content_wrong|style_deviation|layout_composition|color_lighting|text_rendering|ambiguity|context_loss|consistency_break|quality_defect|unknown",',
    '      "description": "问题描述（非空）",',
    '      "promptPart": "source_text|context|optimized_prompt|negative_prompt|unknown",',
    '      "suggestion": "修复建议" }',
    '  ],',
    '  "promptOptimizationPoints": [',
    '    { "type": "add_specificity|resolve_ambiguity|enforce_style|align_context|add_negative|structure_ordering|consistency_anchor",',
    '      "target": "optimized_prompt",',
    '      "suggestion": "可直接用于修改提示词的建议文案（非空）" }',
    '  ]',
    '}',
    '',
    '【约束】',
    '- 所有分数必须是 0-100 整数；evidence 必须引用图片中实际可见的内容。',
    '- problems 与 promptOptimizationPoints 可以为空数组，但不得省略键。',
    '- 只依据给定输入与图片判断，不要脑补图片中没有的信息。',
  ].join('\n')

  return { prompt, truncated, sanitizedKeys }
}

/**
 * 视频评估提示词（v2 占位）：v1 不支持，直接拒绝。
 * @throws {Error} EVAL_MEDIA_TYPE_NOT_SUPPORTED
 */
function buildVideoEvaluationPrompt () {
  const error = new Error('视频评估暂未实现')
  error.code = 'EVAL_MEDIA_TYPE_NOT_SUPPORTED'
  throw error
}

module.exports = {
  buildImageEvaluationPrompt,
  buildVideoEvaluationPrompt,
  normalizeContextSnapshot,
  filterSensitiveDeep,
}
