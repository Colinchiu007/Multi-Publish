// @ts-check
/**
 * video-prompt-engine-contract — 视频提示词优化引擎（prompt-engine video 领域，8013）契约单一来源。
 *
 * ⚠️ 与图片提示词契约刻意分文件、分命名，避免混淆：
 *   - 图片提示词优化：prompt-engine-contract.js（domain=image，/v1/optimize 图片路径）
 *   - 视频提示词优化：本文件（domain=video，/v1/optimize 视频路径 + 结构化 video 字段）
 *
 * 职责：
 *   - 视频平台枚举/别名归一（sora/kling/veo/... → 契约枚举，避免历史别名触发 422）
 *   - 视频优化请求构造（/v1/optimize domain=video 请求体，字段与边界对齐 prompt_engine/models.py）
 *   - 结构化 video 字段收敛（shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint）
 *   - fail-closed 输出校验（error 优先 → 结构 → 内容，与图片契约语义一致）
 *   - 批量契约：/v1/optimize/batch 单批上限 20 条（prompt-engine BatchOptimizeRequest.max_length，2026-08-12 由 10 上调，
 *     服务端有界并发 8）；videogen 场景数 ≤12 单批通过，>20 由调用方分块兜底。
 */
'use strict'

const {
  PROMPT_ENGINE_LIMITS,
  normalizePromptEngineStyle,
  assertNoSensitiveContext,
} = require('./prompt-engine-contract')

const VIDEO_PLATFORMS = Object.freeze(new Set([
  'sora', 'kling', 'veo', 'runway', 'wan', 'seedance', 'minimax',
  'hunyuan', 'cogvideo', 'ltx', 'higgsfield', 'grok', 'agnes', 'generic_video',
]))

/** 历史/展示值 → 视频平台契约枚举（发送前归一，防止 422）。 */
const VIDEO_PLATFORM_ALIASES = Object.freeze({
  'sora-v2': 'sora',
  'sora-v2-pro': 'sora',
  'kling-pro': 'kling',
  'kling-v2': 'kling',
  'kling-v3': 'kling',
  veo3: 'veo',
  'veo-3': 'veo',
  'veo-3.1': 'veo',
  veo2: 'veo',
  'veo-2': 'veo',
  'runway-gen4': 'runway',
  gen4: 'runway',
  wan2: 'wan',
  'wan-2.1': 'wan',
  'seedance-2.0': 'seedance',
  'cogvideo-5b': 'cogvideo',
  'ltx-2': 'ltx',
  ltx2: 'ltx',
})

const DEFAULT_VIDEO_PLATFORM = 'generic_video'

const VIDEO_ENGINE_LIMITS = Object.freeze({
  domain: ['image', 'video'],
  motionIntensity: { min: 1, max: 10, default: 5 },
  shotMax: 50,
  cameraMax: 50,
  transitionMax: 50,
  continuityTokenMax: 100,
})

function _clampNumber (value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 归一化视频领域值；非法值回退 image（图片契约零回归）。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeVideoDomain (value) {
  return String(value || '').trim().toLowerCase() === 'video' ? 'video' : 'image'
}

/**
 * 归一化视频平台值；未知值回退默认（generic_video）。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeVideoPlatform (value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (VIDEO_PLATFORMS.has(raw)) return raw
  if (Object.prototype.hasOwnProperty.call(VIDEO_PLATFORM_ALIASES, raw)) {
    return VIDEO_PLATFORM_ALIASES[raw]
  }
  return DEFAULT_VIDEO_PLATFORM
}

function _normalizeVideoCreativeLevel (value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.creativeLevel.default
  return _clampNumber(raw, PROMPT_ENGINE_LIMITS.creativeLevel.min, PROMPT_ENGINE_LIMITS.creativeLevel.max)
}

function _normalizeVideoMaxLength (value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.maxLength.default
  return _clampNumber(raw, PROMPT_ENGINE_LIMITS.maxLength.min, PROMPT_ENGINE_LIMITS.maxLength.max)
}

function _normalizeVideoNumCandidates (value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.numCandidates.default
  return _clampNumber(raw, PROMPT_ENGINE_LIMITS.numCandidates.min, PROMPT_ENGINE_LIMITS.numCandidates.max)
}

/**
 * 构造视频领域 /v1/optimize 请求体（domain=video）。
 * context 会发给外部服务：对象型上下文先过敏感凭据键拦截。
 * @param {string} prompt
 * @param {object} [options]
 * @returns {object}
 */
function buildVideoOptimizeRequest (prompt, options = {}) {
  const styleRaw = typeof options.style === 'string' ? options.style.trim() : ''
  const autoDetectStyle = options.auto_detect_style !== undefined
    ? Boolean(options.auto_detect_style)
    : (options.autoDetectStyle !== undefined ? Boolean(options.autoDetectStyle) : true)

  const request = {
    prompt: String(prompt).trim(),
    // 本构造器即视频领域专用：未显式传 domain 时默认 video（显式 image 也按字段透传归一）
    domain: options.domain === undefined ? 'video' : normalizeVideoDomain(options.domain),
    platform: normalizeVideoPlatform(options.platform),
    creative_level: _normalizeVideoCreativeLevel(
      options.creative_level !== undefined ? options.creative_level : options.creativeLevel,
    ),
    max_length: _normalizeVideoMaxLength(
      options.max_length !== undefined ? options.max_length : options.maxLength,
    ),
    num_candidates: _normalizeVideoNumCandidates(
      options.num_candidates !== undefined ? options.num_candidates : options.numCandidates,
    ),
  }

  if (styleRaw) {
    request.style = normalizePromptEngineStyle(styleRaw)
  } else if (!autoDetectStyle) {
    request.style = 'realistic'
  }
  if (options.auto_detect_style !== undefined) request.auto_detect_style = Boolean(options.auto_detect_style)
  else if (options.autoDetectStyle !== undefined) request.auto_detect_style = Boolean(options.autoDetectStyle)

  const negativePrompt = typeof options.negative_prompt === 'string' && options.negative_prompt.trim()
    ? options.negative_prompt.trim().slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
    : ''
  if (negativePrompt) request.negative_prompt = negativePrompt

  const context = options.context
  if (context !== undefined && context !== null && context !== '') {
    if (typeof context === 'object') assertNoSensitiveContext(context, 'video-optimize.context')
    request.context = typeof context === 'string' ? { synopsis: context } : context
  }

  return request
}

/**
 * 归一化响应中的 video 结构化字段；越界收敛、缺失给默认值。
 * @param {unknown} raw
 * @returns {object | null}
 */
function normalizeVideoMeta (raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const video = {}
  if (typeof raw.shot === 'string' && raw.shot.trim()) video.shot = raw.shot.trim().slice(0, VIDEO_ENGINE_LIMITS.shotMax)
  if (typeof raw.camera === 'string' && raw.camera.trim()) video.camera = raw.camera.trim().slice(0, VIDEO_ENGINE_LIMITS.cameraMax)
  if (typeof raw.scene_transition === 'string' && raw.scene_transition.trim()) {
    video.scene_transition = raw.scene_transition.trim().slice(0, VIDEO_ENGINE_LIMITS.transitionMax)
  }
  if (typeof raw.continuity_token === 'string' && raw.continuity_token.trim()) {
    video.continuity_token = raw.continuity_token.trim().slice(0, VIDEO_ENGINE_LIMITS.continuityTokenMax)
  }
  const mi = Number(raw.motion_intensity)
  video.motion_intensity = Number.isFinite(mi)
    ? _clampNumber(mi, VIDEO_ENGINE_LIMITS.motionIntensity.min, VIDEO_ENGINE_LIMITS.motionIntensity.max)
    : VIDEO_ENGINE_LIMITS.motionIntensity.default
  const dh = Number(raw.duration_hint)
  if (Number.isFinite(dh) && dh > 0) video.duration_hint = dh
  return video
}

/**
 * 公共校验核心：error → detail → optimized_prompt 非空 fail-closed（与图片契约语义一致）。
 * @param {unknown} result
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, truncated: boolean } | { ok: false, error: string }}
 */
function _extractVideoBase (result, opts = {}) {
  const label = opts.index === undefined ? '' : '场景 ' + opts.index + ' '
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, error: label + 'prompt-engine 返回了非法响应（非对象）' }
  }

  const error = result.error !== undefined && result.error !== null && result.error !== ''
    ? String(result.error).trim()
    : ''
  if (error) {
    return { ok: false, error: label + 'prompt-engine 视频优化失败: ' + error.slice(0, 500) }
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
 * 从 PromptBridge 响应提取视频优化结果并做 fail-closed 校验。
 * 额外收敛 video 结构化字段（motion_intensity 越界收敛，缺失可选字段默认填充）。
 *
 * @param {unknown} result - PromptBridge._post 的解析结果
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, video: object | null, truncated: boolean } | { ok: false, error: string }}
 */
function extractOptimizedVideoPrompt (result, opts = {}) {
  const base = _extractVideoBase(result, opts)
  if (!base.ok) return base
  const video = normalizeVideoMeta(result && typeof result === 'object' ? result.video : undefined)
  const meta = { ...base.meta }
  if (video) meta.video = video
  return { ok: true, prompt: base.prompt, meta, video, truncated: base.truncated }
}

module.exports = {
  VIDEO_PLATFORMS,
  VIDEO_PLATFORM_ALIASES,
  DEFAULT_VIDEO_PLATFORM,
  VIDEO_ENGINE_LIMITS,
  normalizeVideoDomain,
  normalizeVideoPlatform,
  buildVideoOptimizeRequest,
  normalizeVideoMeta,
  extractOptimizedVideoPrompt,
}