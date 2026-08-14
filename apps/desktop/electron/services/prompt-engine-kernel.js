// @ts-check
/**
 * prompt-engine-kernel — 图片/视频提示词契约的共享内核（领域中立单一来源）。
 *
 * 结构原则（openspec change prompt-engine-kernel-refactor）：
 *   - 共享内核只放领域中立逻辑：风格枚举/别名归一、敏感凭据守卫、中立 limits、
 *     数值 clamp、fail-closed 校验核心（extractOptimizedBase）。
 *   - 领域专属（平台枚举、请求构造、字段收敛、语言路由、max_length 能力范围）留在
 *     各自契约文件：prompt-engine-contract.js（图片）/ video-prompt-engine-contract.js（视频）。
 *   - ⚠️ max_length 归属：PROMPT_ENGINE_LIMITS.maxLength 是图片/8013 兼容语义
 *     （min 50 / max 2000 / default 500），视频契约禁止借用，必须使用
 *     VIDEO_ENGINE_LIMITS.videoMaxLengthRanges（legacy [50,2000] / standalone [200,5000]）。
 */
'use strict'

const PROMPT_ENGINE_STYLES = Object.freeze(new Set([
  'realistic', 'cartoon', 'anime', 'oil_painting', 'watercolor', 'pixel',
  'cyberpunk', 'fantasy', 'photography', '3d_render', 'minimalist', 'abstract',
  'portrait', 'landscape',
]))

/** 历史/展示值 → 契约枚举（发送前归一，防止 422）。 */
const PROMPT_ENGINE_STYLE_ALIASES = Object.freeze({
  cinematic: 'photography',
  '3d-render': '3d_render',
})

const DEFAULT_PROMPT_ENGINE_STYLE = 'realistic'

/**
 * 领域中立请求边界（图片/视频共用）。
 * ⚠️ maxLength 为图片/8013 兼容语义（[50, 2000]），视频契约禁止借用：
 * 视频使用 VIDEO_ENGINE_LIMITS.videoMaxLengthRanges（8020 standalone [200, 5000]）。
 */
const PROMPT_ENGINE_LIMITS = Object.freeze({
  promptMax: 2000,
  creativeLevel: { min: 1, max: 10, default: 5 },
  maxLength: { min: 50, max: 2000, default: 500 },
  numCandidates: { min: 1, max: 5, default: 1 },
  negativePromptMax: 500,
  contextDepthMax: 32,
})

/** context 会发给外部服务，禁止透传的敏感凭据键（归一化后匹配）。 */
const SENSITIVE_CONTEXT_KEYS = new Set([
  'api_key', 'access_token', 'refresh_token', 'auth_token', 'bearer_token', 'token',
  'secret', 'secret_key', 'client_secret', 'app_secret', 'password', 'authorization',
  'credential', 'credentials', 'private_key',
])

function normalizedContextKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

/**
 * 深度检查 context 对象是否包含敏感凭据键（api_key/token/secret/password 等）。
 * context 会随请求发给外部 prompt-engine，命中敏感键必须拒绝。
 * @param {unknown} value
 * @param {string} [field]
 * @param {WeakSet} [seen]
 * @param {number} [depth]
 */
function assertNoSensitiveContext(value, field = 'context', seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return
  if (depth > PROMPT_ENGINE_LIMITS.contextDepthMax) throw new Error(field + ' 层级过深')
  if (seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) {
    if (SENSITIVE_CONTEXT_KEYS.has(normalizedContextKey(key))) {
      throw new Error(field + ' 不得包含敏感凭据字段: ' + key)
    }
    assertNoSensitiveContext(value[key], field + '.' + key, seen, depth + 1)
  }
}

/**
 * 归一化 prompt-engine 风格值；未知值回退默认（realistic）。图片/视频共用。
 * @param {unknown} value
 * @returns {string}
 */
function normalizePromptEngineStyle(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (PROMPT_ENGINE_STYLES.has(raw)) return raw
  if (Object.prototype.hasOwnProperty.call(PROMPT_ENGINE_STYLE_ALIASES, raw)) {
    return PROMPT_ENGINE_STYLE_ALIASES[raw]
  }
  return DEFAULT_PROMPT_ENGINE_STYLE
}

/**
 * 数值收敛（min ≤ value ≤ max）。
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 共享 fail-closed 校验核心（error → detail → optimized_prompt 非空），
 * 图片与视频契约共用：error 有值即失败 → detail 422 拒绝 → 空串拒绝 →
 * maxLength 截断（warn 回调）→ 基础 meta（platform/style/model_used/key_source）。
 * 领域专属 meta（图片 detected_categories/candidates、视频 video 字段）由调用方合并。
 * opts.engineLabel：领域名（如 '视频'），仅用于失败文案 `prompt-engine {engineLabel}优化失败`，
 * 默认空串保持图片契约既有文案不变。
 *
 * 依据：/v1/optimize 失败兜底返回 { optimized_prompt: 原文, error }（rest.py:69-75），
 * 忽略 error 会把「未优化原文」当成成功；422 时 FastAPI 返回 { detail: [...] }。
 *
 * @param {unknown} result
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void, engineLabel?: string }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, truncated: boolean } | { ok: false, error: string }}
 */
function extractOptimizedBase(result, opts = {}) {
  const label = opts.index === undefined ? '' : '场景 ' + opts.index + ' '
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, error: label + 'prompt-engine 返回了非法响应（非对象）' }
  }

  const error = result.error !== undefined && result.error !== null && result.error !== ''
    ? String(result.error).trim()
    : ''
  if (error) {
    const engineLabel = typeof opts.engineLabel === 'string' ? opts.engineLabel : ''
    return { ok: false, error: label + 'prompt-engine ' + engineLabel + '优化失败: ' + error.slice(0, 500) }
  }

  const detail = result.detail !== undefined && result.detail !== null && result.detail !== ''
    ? (Array.isArray(result.detail)
        ? result.detail
            .map(item => (item && typeof item === 'object' && typeof item.msg === 'string' ? item.msg : JSON.stringify(item)))
            .join('; ')
        : String(result.detail))
    : ''
  if (detail) {
    return { ok: false, error: label + 'prompt-engine 请求被拒绝(422): ' + detail.slice(0, 500) }
  }

  if (typeof result.optimized_prompt !== 'string') {
    return { ok: false, error: label + 'prompt-engine 返回缺少 optimized_prompt 字段' }
  }

  const prompt = result.optimized_prompt.trim()
  if (!prompt) {
    return { ok: false, error: label + 'prompt-engine 返回了空提示词' }
  }

  let finalPrompt = prompt
  let truncated = false
  const maxLength = Number(opts.maxLength)
  if (Number.isFinite(maxLength)) {
    const points = Array.from(finalPrompt)
    if (points.length > maxLength) {
      finalPrompt = points.slice(0, maxLength).join('')
      truncated = true
      if (typeof opts.warn === 'function') {
        opts.warn(label + 'prompt-engine 结果超过 ' + maxLength + ' 字符，已截断')
      }
    }
  }

  const meta = {}
  if (typeof result.platform === 'string') meta.platform = result.platform
  if (typeof result.style === 'string') meta.style = result.style
  if (typeof result.model_used === 'string') meta.model_used = result.model_used
  if (typeof result.key_source === 'string') meta.key_source = result.key_source

  return { ok: true, prompt: finalPrompt, meta, truncated }
}


/**
 * 创意分层 max_length 解析（图片/视频共用，领域中立）。
 * 从视频契约 _resolveVideoMaxLength 泛化：签名带 range（目标后端能力范围）与
 * batchDefault（常规层默认），能力边界由各领域契约传入。
 *   - 显式传入（非 null/非空串/非纯空白/有限数值）→ 在后端能力范围 [range.min, range.max] 内收敛，始终优先；
 *   - 未显式传 → creative_level ≥ 7 使用精修层默认（resolveTieredMaxLength 不内置精修默认，
 *     由调用方经 batchDefault 语义外的 refinedDefault 参数传入，见下）；
 *     < 7 使用 batchDefault。
 * @param {unknown} explicit
 * @param {number} creativeLevel - 已归一化（1-10）
 * @param {{ min: number, max: number }} range - 目标后端能力范围
 * @param {number} batchDefault - 常规层默认（未显式传且 creativeLevel < 7）
 * @param {number} [refinedDefault] - 精修层默认（creativeLevel ≥ 7 未显式传时使用，收敛到 range.max）
 * @returns {number}
 */
function resolveTieredMaxLength (explicit, creativeLevel, range, batchDefault, refinedDefault) {
  const isExplicit = explicit !== undefined && explicit !== null && explicit !== '' &&
    !(typeof explicit === 'string' && !explicit.trim())
  if (isExplicit) {
    const raw = Number(explicit)
    if (Number.isFinite(raw)) return clampNumber(raw, range.min, range.max)
  }
  if (creativeLevel >= 7) {
    const target = Number.isFinite(Number(refinedDefault)) && refinedDefault > 0
      ? Number(refinedDefault)
      : range.max
    return Math.min(target, range.max)
  }
  return batchDefault
}

/**
 * plausible-only 负面提示词过滤（图片/视频共用，领域中立）。
 * 只保留"真实会发生的失败类别"，清理无类别后缀的裸绝对否定词堆砌。
 * 类别命中：中英文关键词（身份/服装漂移、重复主体/角色、解剖错误、多余肢体/手指、
 * 意外文字/标志/字幕/水印、风格漂移、位置光线变化、参考背景渗入）。
 * @param {unknown} userNegative
 * @returns {string} 过滤后的负面提示词（空串表示无可渲染约束）
 */
const PLAUSIBLE_FAILURE_PATTERNS = Object.freeze([
  // 英文类别（词边界匹配）
  /(^|[^a-z0-9])(identity|costume|outfit|face|character|subject)( |[- ])?(drift|change|swap|replacement|duplicat\w*|repeat\w*)/i,
  /(^|[^a-z0-9])duplicat\w* (character|subject|person|face|hand|limb)/i,
  /(^|[^a-z0-9])anatomy|extra (limb|finger|arm|leg|hand|toe)|six finger|\bmorphing\b|\bwarping\b/i,
  /(^|[^a-z0-9])(text|letter|word|subtitle|watermark|logo|signature|overlay)(s)?\b/i,
  /(^|[^a-z0-9])(style|lighting|color|background|reference)( |[- ])?(drift|shift|change|bleed|inconsisten\w*)/i,
  /(^|[^a-z0-9])(blurr\w*|grain\w*|noise|artifacts?|distortion)/i,
  // 中文类别
  /(身份|服装|衣物|服饰|脸|五官|人物|主体).{0,6}(漂移|变化|换|重复|替换)/,
  /多余.{0,4}(肢体|手指|手臂|腿|脚)|解剖|畸形|变形/,
  /(文字|字母|字幕|水印|标志|logo|签名|文字覆盖)/,
  /(风格|光线|光照|颜色|色彩|背景|参考).{0,6}(漂移|变化|渗入|不一致)/,
  /模糊|噪点|伪影|扭曲/,
])

/** 裸否定片段前缀：否定词开头。前缀后跟实质内容（≥2 中文字符或 ≥4 英文字母）→ 场景排除式约束保留；模糊后缀（"坏"/"bad"）→ 无渲染价值，清理。 */
const BARE_NEGATION_PREFIX = /^(no|not|never|avoid|without|don'?t|do not|不要|禁止|避免|没有|不能|不许)[\s,，;；:：-]*/i

/** 模糊质量词：否定前缀 + 模糊形容词 → 无具体渲染对象，清理（与"具体排除物"区分）。 */
const VAGUE_QUALITY_WORDS = /\b(bad|ugly|ugliness|terrible|awful|horrible|worse|poor|low[- ]?quality|丑|坏|难看|差|垃圾)\b/i

/** 否定前缀后的剩余部分是否具有可渲染价值（具体排除物 vs 模糊否定）。 */
function hasRenderableContent (segment) {
  const rest = segment.replace(BARE_NEGATION_PREFIX, '').trim()
  if (!rest) return false
  if (VAGUE_QUALITY_WORDS.test(rest)) return false
  if (/^[\u4e00-\u9fff]+$/.test(rest)) return rest.length >= 2
  return /[a-zA-Z]/.test(rest) ? rest.replace(/[^a-zA-Z]/g, '').length >= 4 : true
}

function filterPlausibleNegativePrompt (userNegative) {
  if (typeof userNegative !== 'string' || !userNegative.trim()) return ''
  // 按分隔符拆成片段；保留规则：
  //   1) 命中真实失败类别（身份漂移/重复主体/解剖/文字水印/风格漂移等）→ 保留
  //   2) 非否定词开头或有实质内容的排除式约束（场景排除物"电烤箱"、"no people"、"避免人物"）→ 保留
  //   3) 否定词开头且无实质内容（如"不要坏""never bad"）→ 清理
  const segments = userNegative.split(/[,;，；\n]+/).map(segment => segment.trim()).filter(Boolean)
  const kept = segments.filter(segment => {
    if (PLAUSIBLE_FAILURE_PATTERNS.some(pattern => pattern.test(segment))) return true
    if (BARE_NEGATION_PREFIX.test(segment)) return hasRenderableContent(segment)
    return true
  })
  return kept.length > 0 ? kept.join(', ') : ''
}

/**
 * 正向约束收敛（图片/视频共用，领域中立）。
 * 数组透传（非字符串元素丢弃，防 null/对象 → "null"/"[object Object]" 垃圾约束）；
 * 字符串按换行/分号拆分；trim + 去空白；上限 positiveConstraintsMax。
 * @param {unknown} value
 * @param {number} [max] - 上限（默认 10）
 * @returns {string[]}
 */
function normalizePositiveConstraints (value, max = 10) {
  const items = typeof value === 'string'
    ? value.split(/[\n;]+/).map(s => s.trim()).filter(Boolean)
    : (Array.isArray(value)
        ? value.filter(item => typeof item === 'string').map(s => s.trim()).filter(Boolean)
        : [])
  return items.slice(0, max)
}

/**
 * 规则评分（图片/视频共用，领域中立）——多候选择优用。
 * 四维：长度（英文 100-400 词 / 中文 120-4000 字符）、六要素（subject/action/environment/
 * lighting/color/style 关键词命中率）、保真（source 中英文实体命中）、构图（composition 关键词）。
 * 返回 0-100 分数（分数高者优先）。
 * @param {string} prompt
 * @param {{ sourcePrompt?: string, language?: 'zh'|'en' }} [opts]
 * @returns {number}
 */
const PROMPT_ELEMENTS_KEYWORDS = Object.freeze({
  subject: ['character', 'subject', 'hero', 'woman', 'man', 'people', 'person', 'warrior', 'soldier', 'horse', 'cat', 'dog', '人', '女子', '士兵', '战士', '主角'],
  action: ['running', 'walking', 'riding', 'fighting', 'motion', 'moving', 'move', 'rushing', 'chasing', 'flying', 'dancing', '飞', '奔', '战', '走', '跑', '追', '舞', '骑'],
  environment: ['environment', 'scene', 'background', 'landscape', 'city', '室', '城', '原野', '景'],
  lighting: ['light', 'lighting', 'sunlight', 'golden hour', '光'],
  color: ['color', 'palette', 'hue', '色'],
  style: ['style', 'cinematic', 'epic', '风格'],
})

const PROMPT_COMPOSITION_KEYWORDS = ['composition', 'framing', 'angle', 'perspective', 'close-up', 'wide shot', 'rule of thirds', 'depth of field', '构图', '视角', '景别']

function scorePrompt (prompt, opts = {}) {
  const text = String(prompt || '')
  if (!text.trim()) return 0
  const language = opts.language === 'zh' ? 'zh' : 'en'

  // 1) 长度（20 分）：区间内满分；过短按比例，过长按超限比例轻微惩罚（评审 W3）
  const words = text.split(/\s+/).filter(Boolean).length
  let lengthScore
  if (language === 'zh') {
    const chars = text.length
    lengthScore = chars >= 120 && chars <= 4000
      ? 20
      : chars < 120 ? Math.max(0, 20 * (chars / 120)) : Math.max(0, 20 * (4000 / chars))
  } else {
    lengthScore = words >= 100 && words <= 400
      ? 20
      : words < 100 ? Math.max(0, 20 * (words / 100)) : Math.max(0, 20 * (400 / words))
  }

  // 2) 六要素（30 分）
  const lower = text.toLowerCase()
  let hitCount = 0
  for (const keywords of Object.values(PROMPT_ELEMENTS_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) hitCount += 1
  }
  const elementsScore = (hitCount / 6) * 30

  // 3) 保真（20 分）：source 实体命中
  let fidelity = 1.0
  const source = String(opts.sourcePrompt || '')
  if (source) {
    const zhChars = source.match(/[\u4e00-\u9fff]{2,}/g) || []
    if (zhChars.length > 0) {
      const hit = zhChars.slice(0, 8).filter(c => text.includes(c)).length
      fidelity = Math.max(0, hit / Math.min(8, zhChars.length))
    } else {
      const enTokens = (source.match(/[a-zA-Z]{3,}/g) || []).slice(0, 8)
      const hit = enTokens.filter(t => lower.includes(t.toLowerCase())).length
      // C1（评审）：source 无 ≥2 字中文也无 ≥3 字母英文时除零 → NaN；此时保真中性 0（不奖励不惩罚，同源择优排序不变）
      fidelity = enTokens.length > 0 ? Math.max(0, hit / Math.min(8, enTokens.length)) : 0
    }
  }
  const fidelityScore = fidelity * 20

  // 4) 构图（30 分）
  const compositionHits = PROMPT_COMPOSITION_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase())).length
  const compositionScore = Math.min(30, compositionHits * 10)

  return Math.round(Math.min(100, lengthScore + elementsScore + fidelityScore + compositionScore))
}
module.exports = {
  PROMPT_ENGINE_STYLES,
  PROMPT_ENGINE_STYLE_ALIASES,
  DEFAULT_PROMPT_ENGINE_STYLE,
  PROMPT_ENGINE_LIMITS,
  SENSITIVE_CONTEXT_KEYS,
  assertNoSensitiveContext,
  normalizePromptEngineStyle,
  clampNumber,
  extractOptimizedBase,
  resolveTieredMaxLength,
  PLAUSIBLE_FAILURE_PATTERNS,
  filterPlausibleNegativePrompt,
  normalizePositiveConstraints,
  scorePrompt,
}
