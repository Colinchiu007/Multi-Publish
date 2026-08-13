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
 *     VIDEO_ENGINE_LIMITS.videoMaxLengthRanges（legacy [50,2000] / standalone [200,4000]）。
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
 * 视频使用 VIDEO_ENGINE_LIMITS.videoMaxLengthRanges（8020 standalone [200, 4000]）。
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
}
