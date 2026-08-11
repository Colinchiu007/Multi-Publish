// @ts-check
/**
 * prompt-engine-contract — 与外部 prompt-engine 服务（FastAPI，端口 8013）的契约单一来源。
 *
 * 职责：
 *   - 平台/风格枚举与别名归一（避免历史值如 cinematic / dall-e / stable-diffusion 触发 422）
 *   - 请求构造（/v1/optimize 请求体，字段与边界对齐 prompt_engine/models.py）
 *   - 输出校验（fail closed：error 优先 → 结构 → 内容）
 *
 * 被 PromptBridge、story2video-stages、story2video-text-config、stage-executor 共用，
 * 避免「图片提示词统一走 prompt-engine」在多处漂移。
 */
'use strict'

const PROMPT_ENGINE_PLATFORMS = Object.freeze(new Set([
  'midjourney', 'stable_diffusion', 'dalle', 'tongyi', 'yizhang', 'jimeng', 'generic',
]))

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

const PROMPT_ENGINE_PLATFORM_ALIASES = Object.freeze({
  'dall-e': 'dalle',
  'dall-e-2': 'dalle',
  'dall-e-3': 'dalle',
  'stable-diffusion': 'stable_diffusion',
  'stable-diffusion-xl': 'stable_diffusion',
  sdxl: 'stable_diffusion',
  stability: 'stable_diffusion',
  '通义万相': 'tongyi',
  '文心一格': 'yizhang',
  '即梦': 'jimeng',
})

const DEFAULT_PROMPT_ENGINE_STYLE = 'realistic'
const DEFAULT_PROMPT_ENGINE_PLATFORM = 'generic'

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
 * 归一化 prompt-engine 风格值；未知值回退默认（realistic）。
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
 * 归一化 prompt-engine 平台值；未知值回退默认（generic）。
 * @param {unknown} value
 * @returns {string}
 */
function normalizePromptEnginePlatform(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (PROMPT_ENGINE_PLATFORMS.has(raw)) return raw
  if (Object.prototype.hasOwnProperty.call(PROMPT_ENGINE_PLATFORM_ALIASES, raw)) {
    return PROMPT_ENGINE_PLATFORM_ALIASES[raw]
  }
  return DEFAULT_PROMPT_ENGINE_PLATFORM
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 构造 /v1/optimize 请求体（字段与边界对齐 prompt_engine/models.py:126-141）。
 *
 * 规则：
 *   - style 显式指定（非空）→ 发送归一化 style；未指定且 autoDetectStyle=true → 省略 style，由服务端检测
 *   - creative_level / max_length / num_candidates 收敛到契约边界
 *   - negative_prompt 截断到 500；context 为对象时透传（敏感键由上层校验）
 * @param {string} prompt
 * @param {object} [options]
 * @returns {object}
 */
function buildPromptEngineOptimizeRequest(prompt, options = {}) {
  const styleRaw = typeof options.style === 'string' ? options.style.trim() : ''
  const autoDetectStyle = options.auto_detect_style !== undefined
    ? Boolean(options.auto_detect_style)
    : (options.autoDetectStyle !== undefined ? Boolean(options.autoDetectStyle) : true)

  const request = {
    prompt: String(prompt || '').slice(0, PROMPT_ENGINE_LIMITS.promptMax),
    platform: normalizePromptEnginePlatform(options.platform),
    creative_level: normalizeCreativeLevel(options.creative_level ?? options.creativeLevel),
    max_length: normalizeMaxLength(options.max_length ?? options.maxLength),
    num_candidates: normalizeNumCandidates(options.num_candidates ?? options.numCandidates),
    auto_detect_style: autoDetectStyle,
  }

  if (styleRaw) {
    request.style = normalizePromptEngineStyle(styleRaw)
  } else if (!autoDetectStyle) {
    request.style = DEFAULT_PROMPT_ENGINE_STYLE
  }

  const negativePrompt = typeof options.negative_prompt === 'string' && options.negative_prompt.trim()
    ? options.negative_prompt.trim().slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
    : ''
  if (negativePrompt) request.negative_prompt = negativePrompt

  const context = options.context
  if (context !== undefined && context !== null && context !== '') {
    // context 会发给外部服务：对象型上下文必须先过敏感凭据键拦截（防 api_key/token 外发）
    if (typeof context === 'object') assertNoSensitiveContext(context, 'optimize.context')
    request.context = typeof context === 'string' ? { synopsis: context } : context
  }

  return request
}

function normalizeCreativeLevel(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.creativeLevel.default
  return clampNumber(raw, PROMPT_ENGINE_LIMITS.creativeLevel.min, PROMPT_ENGINE_LIMITS.creativeLevel.max)
}

function normalizeMaxLength(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.maxLength.default
  return clampNumber(raw, PROMPT_ENGINE_LIMITS.maxLength.min, PROMPT_ENGINE_LIMITS.maxLength.max)
}

function normalizeNumCandidates(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.numCandidates.default
  return clampNumber(raw, PROMPT_ENGINE_LIMITS.numCandidates.min, PROMPT_ENGINE_LIMITS.numCandidates.max)
}

/**
 * 从 PromptBridge 响应提取优化结果并做 fail-closed 校验。
 *
 * 校验顺序（Critical）：error 优先 → 结构（detail/非法）→ 内容（空串）。
 * 依据：/v1/optimize 失败兜底返回 { optimized_prompt: 原文, error }（rest.py:69-75），
 * 忽略 error 会把「未优化原文」当成成功；422 时 FastAPI 返回 { detail: [...] }。
 *
 * @param {unknown} result - PromptBridge._post 的解析结果
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, truncated: boolean } | { ok: false, error: string }}
 */
function extractOptimizedPrompt(result, opts = {}) {
  const label = opts.index === undefined ? '' : '场景 ' + opts.index + ' '
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, error: label + 'prompt-engine 返回了非法响应（非对象）' }
  }

  // error 有值即失败（string 或对象/数组都算），防「兜底原文+error」被当成成功
  const error = result.error !== undefined && result.error !== null && result.error !== ''
    ? String(result.error).trim()
    : ''
  if (error) {
    return { ok: false, error: label + 'prompt-engine 优化失败: ' + error.slice(0, 500) }
  }

  // detail 任意非空值（数组/字符串/对象）都按校验拒绝处理
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
  if (result.detected_categories && typeof result.detected_categories === 'object') {
    meta.detected_categories = result.detected_categories
  }
  if (Array.isArray(result.candidates)) meta.candidates = result.candidates

  return { ok: true, prompt: finalPrompt, meta, truncated }
}

module.exports = {
  PROMPT_ENGINE_PLATFORMS,
  PROMPT_ENGINE_STYLES,
  PROMPT_ENGINE_STYLE_ALIASES,
  PROMPT_ENGINE_PLATFORM_ALIASES,
  PROMPT_ENGINE_LIMITS,
  DEFAULT_PROMPT_ENGINE_STYLE,
  DEFAULT_PROMPT_ENGINE_PLATFORM,
  normalizePromptEngineStyle,
  normalizePromptEnginePlatform,
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
  assertNoSensitiveContext,
  SENSITIVE_CONTEXT_KEYS,
}
