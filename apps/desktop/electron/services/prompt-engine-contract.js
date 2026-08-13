// @ts-check
/**
 * prompt-engine-contract — 图片提示词契约（与外部 prompt-engine 服务 8013 的契约单一来源）。
 *
 * 结构（openspec change prompt-engine-kernel-refactor）：
 *   - 领域中立逻辑（风格归一、敏感凭据守卫、中立 limits、fail-closed 核心 extractOptimizedBase）
 *     集中在 prompt-engine-kernel.js，本文件 re-export，公共 API 与行为零变化。
 *   - 图片专属：平台枚举/别名/归一、请求构造（/v1/optimize）、
 *     extractOptimizedPrompt（kernel base + detected_categories/candidates meta）。
 *   - 视频契约（video-prompt-engine-contract.js）改从 kernel 引入，不经过本文件。
 *
 * 被 PromptBridge、story2video-stages、story2video-text-config、stage-executor 共用，
 * 避免「图片提示词统一走 prompt-engine」在多处漂移。
 */
'use strict'

const {
  PROMPT_ENGINE_STYLES,
  PROMPT_ENGINE_STYLE_ALIASES,
  DEFAULT_PROMPT_ENGINE_STYLE,
  PROMPT_ENGINE_LIMITS,
  SENSITIVE_CONTEXT_KEYS,
  assertNoSensitiveContext,
  normalizePromptEngineStyle,
  clampNumber,
  extractOptimizedBase,
} = require('./prompt-engine-kernel')

const PROMPT_ENGINE_PLATFORMS = Object.freeze(new Set([
  'midjourney', 'stable_diffusion', 'dalle', 'tongyi', 'yizhang', 'jimeng', 'generic',
]))

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

const DEFAULT_PROMPT_ENGINE_PLATFORM = 'generic'

/**
 * 归一化 prompt-engine 平台值；未知值回退默认（generic）。图片领域专属。
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

/**
 * 从 PromptBridge 响应提取图片优化结果并做 fail-closed 校验。
 * 基于共享内核 extractOptimizedBase（error → detail → 空串 → 截断），
 * 成功时额外合并图片领域 meta（detected_categories/candidates）。
 *
 * @param {unknown} result - PromptBridge._post 的解析结果
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, truncated: boolean } | { ok: false, error: string }}
 */
function extractOptimizedPrompt(result, opts = {}) {
  const base = extractOptimizedBase(result, opts)
  if (!base.ok) return base
  const meta = { ...base.meta }
  if (result.detected_categories && typeof result.detected_categories === 'object') {
    meta.detected_categories = result.detected_categories
  }
  if (Array.isArray(result.candidates)) meta.candidates = result.candidates
  return { ok: true, prompt: base.prompt, meta, truncated: base.truncated }
}

module.exports = {
  // 共享内核 re-export（公共 API 保持既有 13 项 + 新增 clampNumber/extractOptimizedBase）
  ...require('./prompt-engine-kernel'),
  // 图片领域专属
  PROMPT_ENGINE_PLATFORMS,
  PROMPT_ENGINE_PLATFORM_ALIASES,
  DEFAULT_PROMPT_ENGINE_PLATFORM,
  normalizePromptEnginePlatform,
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
}
