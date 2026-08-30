// @ts-check
/**
 * video-prompt-engine-contract — 视频提示词优化引擎契约单一来源（双后端）。
 *
 * 双后端（2026-08-12 video-prompt-engine-enhancement D8）：
 *   - 独立视频引擎（video_prompt_engine，8020）：/v1/video/optimize，环境变量 VIDEO_PROMPT_PORT=<端口> 启用，
 *     请求体为 VideoOptimizeRequest（prompt/platform/style/creative_level/max_length/num_candidates/
 *     negative_prompt/context/output_language），响应含 language/cache_hit/retried/classification 增强字段；
 *   - 兼容后端（prompt-engine video 领域，8013）：/v1/optimize domain=video（未配置 VIDEO_PROMPT_PORT 或独立引擎
 *     不可用时回退；回退由 PromptBridge 记录 warning，本契约输出校验两者共用 extractOptimizedVideoPrompt）。
 *
 * 结构（openspec change prompt-engine-kernel-refactor）：
 *   - 领域中立逻辑（风格归一/敏感凭据守卫/中立 limits/fail-closed 核心 extractOptimizedBase）
 *     来自共享内核 prompt-engine-kernel.js；⚠️ max_length 禁止借用 PROMPT_ENGINE_LIMITS.maxLength
 *     （图片/8013 语义 [50,2000]），必须使用 VIDEO_ENGINE_LIMITS.videoMaxLengthRanges。
 *   - 领域专属（平台/语言路由/字段收敛/画像/trailer）保留在本文件。
 *
 * 导演工作流（openspec change video-prompt-higgsfield-mechanics）：
 *   - 双向约束字段收敛（excluded_characters / no_swap_pairs / color_ratio）+ 多切时间块（shots[]/beats[]）
 *   - 收尾参数行 appendVideoTrailer + 平台参数画像（PLATFORM_VIDEO_PROFILES）
 *   - 结构完整性 fail-closed 校验（声明排除/防替换但正文无引用协议标记 → 拒绝）
 *   - 精修层 max_length 层级语义（按后端能力门控：8013 [50,2000] / 8020 [200,40000]）
 *
 * ⚠️ 与图片提示词契约刻意分文件、分命名，避免混淆（共享逻辑经 kernel）。
 */
'use strict'

const {
  PROMPT_ENGINE_LIMITS,
  normalizePromptEngineStyle,
  assertNoSensitiveContext,
  clampNumber,
  extractOptimizedBase,
  resolveTieredMaxLength,
} = require('./prompt-engine-kernel')

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
  positiveConstraintsMax: 10,
  finalFrameMax: 1000,
  prevFinalFrameMax: 1000,
  blockValueMax: 4000,
  // Round3 C：导演分镜块骨架白名单（12 键，与引擎 refined_blocks 渲染骨架同源）
  blockKeys: Object.freeze([
    'SCENE NOTE', 'SPATIAL LAYOUT', 'LIGHTING', 'COLOR', 'CAMERA',
    'ENVIRONMENT', 'CONTINUITY', 'CHARACTERS', 'SKIN', 'ACTING',
    'STILLNESS LOCK', 'FINAL FRAME',
  ]),
  // video-content-fidelity S4：context 白名单键与长度上限（对齐 prompt-engine OptimizeRequest.context 已知键）
  contextKeys: Object.freeze(['synopsis', 'character', 'setting', 'character_list', 'full_text']),
  contextKeyMax: Object.freeze({ synopsis: 500, character: 500, setting: 500, full_text: 2000, character_list: 10 }),
  // 导演工作流（video-prompt-higgsfield-mechanics）：双向约束/多切时间块上限
  excludedCharactersMax: 10,
  noSwapPairsMax: 5,
  shotsMax: 3,
  beatsPerShotMax: 6,
  beatTimeMax: 40,
  beatActionMax: 500,
  shotDurationMax: 15,
  // 精修层预算默认值：creative_level ≥ 7 未显式传时使用（对齐 8020 引擎默认语义）；
  // 精修层导演分镜单真实形态 500-5000 词（≈22871 字符），显式传值由 standalone 范围放行（tasks 4.4 边界上浮）。
  videoMaxLengthRefinedDefault: 5000,
  // 常规层默认对齐 8020 引擎默认（video_prompt_engine/models.py max_length 默认 1800）；
  // 旧契约发 500（PROMPT_ENGINE_LIMITS.maxLength.default）与引擎默认失配，500 字符装不下 batch 层 100 词下界
  videoMaxLengthBatchDefault: 1800,
  // 精修层目标上限（引擎侧 video_prompt_engine/models.py le=40000 已对齐）：容纳 500-5000 词导演分镜单
  videoMaxLengthMax: 40000,
  // 目标后端能力范围（防 422，评审 C1 证据）：8013 prompt_engine/models.py ge=50/le=2000；
  // 8020 video_prompt_engine/models.py ge=200/le=40000（2026-08-16 上界 20000→40000）
  videoMaxLengthRanges: Object.freeze({
    legacy: Object.freeze({ min: 50, max: 2000 }),
    standalone: Object.freeze({ min: 200, max: 40000 }),
  }),
})

/**
 * 引用协议标记集（结构完整性校验，可扩展）。
 * 语料实证：引擎输出可能为 `<<<...>>>` 或 `[ABSENT] 角色名` 形态；大小写敏感。
 */
const VIDEO_REFERENCE_MARKERS = Object.freeze(['<<<', '[ABSENT]'])

/**
 * 平台参数画像（四键：duration/aspect/resolution/audio）。
 * seedance 语料实证默认 15s/21:9/1080p/audio on；未登记平台回退 generic_video。
 * 画像键 → appendVideoTrailer options 的类型映射（audio 布尔 → "SFX"/"No audio"）由调用方接线转换。
 */
const PLATFORM_VIDEO_PROFILES = Object.freeze({
  seedance: Object.freeze({ duration: 15, aspect: '21:9', resolution: '1080p', audio: true }),
  generic_video: Object.freeze({ duration: 15, aspect: '16:9', resolution: '1080p', audio: false }),
})

/**
 * 查询平台参数画像；未登记平台（含归一后 generic_video）回退通用画像，不抛出。
 * @param {unknown} platform
 * @returns {{ duration: number, aspect: string, resolution: string, audio: boolean }}
 */
function getVideoProfile (platform) {
  const normalized = normalizeVideoPlatform(platform)
  return PLATFORM_VIDEO_PROFILES[normalized] || PLATFORM_VIDEO_PROFILES.generic_video
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
  return clampNumber(raw, PROMPT_ENGINE_LIMITS.creativeLevel.min, PROMPT_ENGINE_LIMITS.creativeLevel.max)
}

function _normalizeVideoNumCandidates (value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return PROMPT_ENGINE_LIMITS.numCandidates.default
  return clampNumber(raw, PROMPT_ENGINE_LIMITS.numCandidates.min, PROMPT_ENGINE_LIMITS.numCandidates.max)
}

/**
 * 内置 no-text 负面提示词（最高优先级）。
 * 所有视频优化请求自动注入，防止视频模型在画面中生成文字/字幕/水印伪影。
 */
const BUILT_IN_VIDEO_NO_TEXT_NEGATIVE = 'clean frame, no text, no subtitles, no watermarks, no logos, no text overlays, no burned-in text, no characters or letters rendered in the frame, no watermark artifacts';

/**
 * 跨镜承接上镜终态归一：非字符串丢弃；trim 后空丢弃；>1000 按句截断（句子边界优先，兜底硬截断）。
 * @param {unknown} value
 * @returns {string | undefined}
 */
function normalizePrevFinalFrame (value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length <= VIDEO_ENGINE_LIMITS.prevFinalFrameMax) return trimmed
  // 按句截断：在 1000 字符窗口内回溯最近句末，避免恰好落在下一句中间时切断实体；无句末才硬截断
  const head = trimmed.slice(0, VIDEO_ENGINE_LIMITS.prevFinalFrameMax)
  let sentenceEnd = -1
  const re = /[。！？.!?；;][\s）)」』”]*/gu
  for (const match of head.matchAll(re)) sentenceEnd = match.index + match[0].trimEnd().length
  // 仅剩 1 个字符（如 head 以单个句号开头）时视为退化，回退硬截断保底完整 1000 字符
  return sentenceEnd > 1 ? head.slice(0, sentenceEnd) : head
}

/**
 * 导演分镜块骨架归一（Round3 C）：12 键白名单 + 字符串值 trim/截断 4000；非法键/非字符串丢弃；空 → undefined。
 * @param {unknown} value
 * @returns {object | undefined}
 */
function normalizeVideoBlocks (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out = {}
  for (const key of VIDEO_ENGINE_LIMITS.blockKeys) {
    const raw = value[key]
    if (typeof raw === 'string' && raw.trim()) out[key] = raw.trim().slice(0, VIDEO_ENGINE_LIMITS.blockValueMax)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeVideoContext (context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined
  const out = {}
  for (const key of VIDEO_ENGINE_LIMITS.contextKeys) {
    const value = context[key]
    if (value === undefined || value === null) continue
    if (key === 'character_list') {
      if (Array.isArray(value)) {
        const names = value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
        if (names.length > 0) out[key] = names.slice(0, VIDEO_ENGINE_LIMITS.contextKeyMax[key])
      }
      continue
    }
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim().slice(0, VIDEO_ENGINE_LIMITS.contextKeyMax[key])
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 构造视频领域 /v1/optimize 请求体（domain=video，8013 兼容后端）。
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

  const creativeLevel = _normalizeVideoCreativeLevel(options.creative_level ?? options.creativeLevel)
  const request = {
    prompt: String(prompt).trim(),
    // 本构造器即视频领域专用：未显式传 domain 时默认 video（显式 image 也按字段透传归一）
    domain: options.domain === undefined ? 'video' : normalizeVideoDomain(options.domain),
    platform: normalizeVideoPlatform(options.platform),
    creative_level: creativeLevel,
    max_length: resolveTieredMaxLength(
      options.max_length !== undefined ? options.max_length : options.maxLength,
      creativeLevel,
      VIDEO_ENGINE_LIMITS.videoMaxLengthRanges.legacy,
      PROMPT_ENGINE_LIMITS.maxLength.default,
      VIDEO_ENGINE_LIMITS.videoMaxLengthRefinedDefault,
    ),
    num_candidates: _normalizeVideoNumCandidates(options.num_candidates ?? options.numCandidates),
  }

  // Round3 B 跨镜承接：prev_final_frame 仅由独立视频引擎（8020）消费；
  // 8013 兼容后端不支持该字段，构造时剥离（与 output_language/model 同先例），8020 路径见 buildStandaloneVideoOptimizeRequest

  if (styleRaw) {
    request.style = normalizePromptEngineStyle(styleRaw)
  } else if (!autoDetectStyle) {
    request.style = 'realistic'
  }
  if (options.auto_detect_style !== undefined) request.auto_detect_style = Boolean(options.auto_detect_style)
  else if (options.autoDetectStyle !== undefined) request.auto_detect_style = Boolean(options.autoDetectStyle)

  const userNegative = typeof options.negative_prompt === 'string' && options.negative_prompt.trim()
    ? options.negative_prompt.trim().slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
    : ''
  const mergedNegative = [BUILT_IN_VIDEO_NO_TEXT_NEGATIVE, userNegative].filter(Boolean).join(', ').slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
  if (mergedNegative) request.negative_prompt = mergedNegative

  const context = options.context
  if (context !== undefined && context !== null && context !== '') {
    if (typeof context === 'object') assertNoSensitiveContext(context, 'video-optimize.context')
    const normalizedContext = typeof context === 'string'
      ? { synopsis: String(context).trim().slice(0, VIDEO_ENGINE_LIMITS.contextKeyMax.synopsis) }
      : normalizeVideoContext(context)
    if (normalizedContext && Object.keys(normalizedContext).length > 0) {
      request.context = normalizedContext
    }
  }

  return request
}

/**
 * 独立视频引擎（video_prompt_engine，8020）是否启用：VIDEO_PROMPT_PORT 为合法端口即启用。
 * @returns {boolean}
 */
function isStandaloneVideoEngineEnabled () {
  const raw = String(process.env.VIDEO_PROMPT_PORT || '').trim()
  return /^\d{2,5}$/.test(raw) && Number(raw) > 0
}

/**
 * 独立视频引擎目标 host/port（VIDEO_PROMPT_HOST 可选，默认 127.0.0.1）。
 * @returns {{ host: string, port: string }}
 */
function getStandaloneVideoEngineTarget () {
  const port = String(process.env.VIDEO_PROMPT_PORT || '').trim()
  const host = String(process.env.VIDEO_PROMPT_HOST || '127.0.0.1').trim()
  return { host, port }
}

/**
 * 按目标视频平台推荐输出语言（2026-08-12 语言路由增强）：
 *   国产视频模型（MiniMax/即梦/可灵/海螺/豆包/混元/万相/CogVideo/Agnes）→ zh（中文主体 + 镜头术语双语）；
 *   国外视频模型（Veo/Runway/Sora/Pika/Luma/LTX）→ en（模型按英文语料优化）。
 * 与 8020 引擎平台策略对齐：doubao 中文优先 / veo 英文长镜头。
 */
const VIDEO_PLATFORM_LANGUAGE = Object.freeze({
  zh: Object.freeze(new Set(['minimax', 'seedance', 'kling', 'hailuo', 'doubao', 'cogvideo', 'hunyuan', 'wan', 'agnes'])),
  en: Object.freeze(new Set(['veo', 'runway', 'sora', 'ltx', 'pika', 'luma'])),
})

/**
 * 通用网关 provider（openai_compat / 自定义 base_url 承载多模型）场景：
 * providerId 无法命中平台集合时，按 model 名关键词兜底判定语言。
 */
const MODEL_LANGUAGE_KEYWORDS = Object.freeze({
  zh: Object.freeze(['minimax', 'seedance', 'kling', 'hailuo', 'doubao', 'cogvideo', 'hunyuan', 'wan', 'agnes']),
  en: Object.freeze(['veo', 'runway', 'sora', 'pika', 'luma', 'ltx']),
})

/**
 * 按（已归一）平台推荐语言；未知平台返回 ''。
 * @param {string} platform
 * @returns {'zh'|'en'|''}
 */
function languageFromVideoPlatform (platform) {
  const p = normalizeVideoPlatform(platform)
  if (VIDEO_PLATFORM_LANGUAGE.zh.has(p)) return 'zh'
  if (VIDEO_PLATFORM_LANGUAGE.en.has(p)) return 'en'
  return ''
}

/**
 * 按 model 名关键词兜底判定语言；无命中返回 ''。
 * @param {unknown} model
 * @returns {'zh'|'en'|''}
 */
function languageFromVideoModel (model) {
  if (typeof model !== 'string') return ''  // 非标量（对象/数组）不参与判定，避免 [object Object] 误命中
  const m = model.toLowerCase()
  if (!m) return ''
  // 词边界匹配：避免 'wan' 误命中 'swan-video'、'veo' 误命中 'wevideo' 等子串
  const hit = (kw) => new RegExp('(^|[^a-z0-9])' + kw + '($|[^a-z0-9])').test(m)
  if (MODEL_LANGUAGE_KEYWORDS.en.some(hit)) return 'en'
  if (MODEL_LANGUAGE_KEYWORDS.zh.some(hit)) return 'zh'
  return ''
}

/**
 * 输出语言解析（优先序：显式参数 → 平台集合 → model 关键词 → 文本 CJK 检测）。
 * @param {{ langRaw?: unknown, platform?: string, model?: unknown, texts: string[] }} input
 * @returns {'zh'|'en'}
 */
function _resolveOutputLanguage ({ langRaw, platform, model, texts }) {
  const explicit = typeof langRaw === 'string' && langRaw.trim()
    ? langRaw.trim().toLowerCase()
    : ''
  if (explicit === 'zh' || explicit === 'en') return explicit
  const byPlatform = languageFromVideoPlatform(platform)
  if (byPlatform) return byPlatform
  const byModel = languageFromVideoModel(model)
  if (byModel) return byModel
  return _detectOutputLanguage(texts)
}

/**
 * 自动检测输出语言：文本中 CJK 字符占比 ≥30% → zh，否则 en（图片引擎无此维度，仅独立引擎使用）。
 * @param {string|string[]} texts
 * @returns {'zh'|'en'}
 */
function _detectOutputLanguage (texts) {
  const joined = (Array.isArray(texts) ? texts : [texts]).map(t => String(t || '')).join(' ')
  const chars = joined.replace(/\s/g, '')
  if (!chars) return 'en'
  const cjk = (chars.match(/[一-鿿]/g) || []).length
  return (cjk / chars.length) >= 0.3 ? 'zh' : 'en'
}

/**
 * 构造独立视频引擎（8020）请求体 — VideoOptimizeRequest（无 domain 字段）。
 * 平台/风格/边界收敛与 8013 共用同一归一化；max_length 按 8020 能力范围 [200,40000] 门控；
 * output_language 解析：显式参数 → 目标平台集合（国产模型 zh / 国外模型 en）→ model 关键词兜底 → 文本 CJK 自动检测。
 * @param {string} prompt
 * @param {object} [options]
 * @returns {object}
 */
function buildStandaloneVideoOptimizeRequest (prompt, options = {}) {
  const styleRaw = typeof options.style === 'string' ? options.style.trim() : ''
  const autoDetectStyle = options.auto_detect_style !== undefined
    ? Boolean(options.auto_detect_style)
    : (options.autoDetectStyle !== undefined ? Boolean(options.autoDetectStyle) : true)
  const creativeLevel = _normalizeVideoCreativeLevel(options.creative_level ?? options.creativeLevel)

  const request = {
    prompt: String(prompt).trim(),
    platform: normalizeVideoPlatform(options.platform),
    creative_level: creativeLevel,
    max_length: resolveTieredMaxLength(
      options.max_length !== undefined ? options.max_length : options.maxLength,
      creativeLevel,
      VIDEO_ENGINE_LIMITS.videoMaxLengthRanges.standalone,
      VIDEO_ENGINE_LIMITS.videoMaxLengthBatchDefault,
      VIDEO_ENGINE_LIMITS.videoMaxLengthRefinedDefault,
    ),
    num_candidates: _normalizeVideoNumCandidates(options.num_candidates ?? options.numCandidates),
  }

  // Round3 B：跨镜承接上镜终态（非字符串丢弃、trim 空丢弃、>1000 按句截断）
  const prevFinalFrame = normalizePrevFinalFrame(options.prev_final_frame)
  if (prevFinalFrame) request.prev_final_frame = prevFinalFrame

  if (styleRaw) {
    request.style = normalizePromptEngineStyle(styleRaw)
  } else if (!autoDetectStyle) {
    request.style = 'realistic'
  }

  const userNegative = typeof options.negative_prompt === 'string' && options.negative_prompt.trim()
    ? options.negative_prompt.trim().slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
    : ''
  const mergedNegative = [BUILT_IN_VIDEO_NO_TEXT_NEGATIVE, userNegative].filter(Boolean).join(', ').slice(0, PROMPT_ENGINE_LIMITS.negativePromptMax)
  if (mergedNegative) request.negative_prompt = mergedNegative

  const context = options.context
  if (context !== undefined && context !== null && context !== '') {
    if (typeof context === 'object') assertNoSensitiveContext(context, 'video-optimize.context')
    const normalizedContext = typeof context === 'string'
      ? { synopsis: String(context).trim().slice(0, VIDEO_ENGINE_LIMITS.contextKeyMax.synopsis) }
      : normalizeVideoContext(context)
    if (normalizedContext && Object.keys(normalizedContext).length > 0) {
      request.context = normalizedContext
    }
  }

  const contextText = request.context && typeof request.context === 'object'
    ? request.context.full_text || request.context.synopsis || ''
    : ''
  // 语言路由：显式参数 → 目标平台集合 → model 关键词兜底 → 文本 CJK 检测
  request.output_language = _resolveOutputLanguage({
    langRaw: options.output_language !== undefined ? options.output_language : options.outputLanguage,
    platform: request.platform,
    model: options.model !== undefined ? options.model : options.modelName,
    texts: [request.prompt, contextText],
  })

  return request
}

/**
 * 归一化响应中的 video 结构化字段；越界收敛、缺失给默认值。
 * final_frame 为「计划终态」提示词元数据（供跨镜承接 prev_final_frame 链复用），
 * 非解码输出视频的证据（是否真正落到画面需以实际生成产物为准）。
 * 导演工作流字段（video-prompt-higgsfield-mechanics）：excluded_characters / no_swap_pairs /
 * color_ratio / shots[]（含 beats[]）——非法输入丢弃而非抛出，超限截断。
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
    ? clampNumber(mi, VIDEO_ENGINE_LIMITS.motionIntensity.min, VIDEO_ENGINE_LIMITS.motionIntensity.max)
    : VIDEO_ENGINE_LIMITS.motionIntensity.default
  const dh = Number(raw.duration_hint)
  if (Number.isFinite(dh) && dh > 0) video.duration_hint = dh

  const constraints = typeof raw.positive_constraints === 'string'
    ? raw.positive_constraints.split(/[\n;]+/).map(c => c.trim()).filter(Boolean)
    : Array.isArray(raw.positive_constraints)
      // 与 _normalizeExcludedCharacters 同防御模式：非字符串元素直接丢弃（防 null/对象 → "null"/"[object Object]" 垃圾约束）
      ? raw.positive_constraints.filter(c => typeof c === 'string').map(c => c.trim()).filter(Boolean)
      : []
  if (constraints.length > 0) {
    video.positive_constraints = constraints.slice(0, VIDEO_ENGINE_LIMITS.positiveConstraintsMax)
  }
  if (typeof raw.final_frame === 'string' && raw.final_frame.trim()) {
    video.final_frame = raw.final_frame.trim().slice(0, VIDEO_ENGINE_LIMITS.finalFrameMax)
  }
  // Round3 C：导演分镜块骨架回显（12 键白名单 + 值 ≤4000；缺失/非法丢弃，零回归）
  const blocks = normalizeVideoBlocks(raw.blocks)
  if (blocks) video.blocks = blocks

  const excluded = _normalizeExcludedCharacters(raw.excluded_characters)
  if (excluded) video.excluded_characters = excluded
  const swapPairs = _normalizeNoSwapPairs(raw.no_swap_pairs)
  if (swapPairs) video.no_swap_pairs = swapPairs
  const colorRatio = _normalizeColorRatio(raw.color_ratio)
  if (colorRatio) video.color_ratio = colorRatio
  const shots = _normalizeShots(raw.shots)
  if (shots) video.shots = shots

  return video
}

/** 去空白后按 trim 精确去重（大小写敏感，保留首次出现序）。 */
function _dedupePreserveOrder (items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

/**
 * excluded_characters 收敛：兼容字符串（按 [\n;,]+ 分割）与字符串数组；
 * 输出去空白、trim 后精确去重（大小写敏感）、上限 10；非法输入返回 undefined。
 * @param {unknown} value
 * @returns {string[] | undefined}
 */
function _normalizeExcludedCharacters (value) {
  const names = typeof value === 'string'
    ? value.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean)
    : (Array.isArray(value)
        ? value.filter(item => typeof item === 'string').map(s => s.trim()).filter(Boolean)
        : [])
  if (names.length === 0) return undefined
  return _dedupePreserveOrder(names).slice(0, VIDEO_ENGINE_LIMITS.excludedCharactersMax)
}

/**
 * no_swap_pairs 收敛：每对为恰含两个非空字符串的二元组 [from, to]（规范形态，见 spec 双向约束字段契约）；
 * 兼容引擎（8020 video_prompt_engine）对象形态 {"from","to"} 自动转二元组。
 * 任一元素非法整对丢弃；上限 5，超限截断；非法输入返回 undefined。
 * @param {unknown} value
 * @returns {string[][] | undefined}
 */
function _normalizeNoSwapPairs (value) {
  if (!Array.isArray(value)) return undefined
  const pairs = []
  for (const pair of value) {
    let first
    let second
    if (Array.isArray(pair)) {
      if (pair.length !== 2) continue
      first = typeof pair[0] === 'string' ? pair[0].trim() : ''
      second = typeof pair[1] === 'string' ? pair[1].trim() : ''
    } else if (pair && typeof pair === 'object') {
      first = typeof pair.from === 'string' ? pair.from.trim() : ''
      second = typeof pair.to === 'string' ? pair.to.trim() : ''
    } else {
      continue
    }
    if (!first || !second) continue
    pairs.push([first, second])
    if (pairs.length >= VIDEO_ENGINE_LIMITS.noSwapPairsMax) break
  }
  return pairs.length > 0 ? pairs : undefined
}

/**
 * color_ratio 收敛：格式 ^\d{1,3}(:\d{1,3}){2}$ 且三段均为正整数；不匹配/缺失丢弃且不填充。
 * @param {unknown} value
 * @returns {string | undefined}
 */
function _normalizeColorRatio (value) {
  if (typeof value !== 'string') return undefined
  const parts = value.split(':')
  if (parts.length !== 3) return undefined
  if (!parts.every(part => /^\d{1,3}$/.test(part) && Number(part) > 0)) return undefined
  return value
}

/**
 * shots[] 收敛：每切需非空 shot/camera、正数 duration（超 15 clamp 而非丢弃）、
 * beats 存在时须为数组；任一子字段非法整切丢弃；数组上限 3；全部非法不输出 shots 键。
 * @param {unknown} value
 * @returns {object[] | undefined}
 */
function _normalizeShots (value) {
  if (!Array.isArray(value)) return undefined
  const shots = []
  for (const rawShot of value) {
    if (!rawShot || typeof rawShot !== 'object' || Array.isArray(rawShot)) continue
    const shot = typeof rawShot.shot === 'string' ? rawShot.shot.trim() : ''
    const camera = typeof rawShot.camera === 'string' ? rawShot.camera.trim() : ''
    const duration = Number(rawShot.duration)
    if (!shot || !camera || !Number.isFinite(duration) || duration <= 0) continue
    if (rawShot.beats !== undefined && !Array.isArray(rawShot.beats)) continue
    const beats = _normalizeBeats(rawShot.beats)
    const normalized = {
      shot: shot.slice(0, VIDEO_ENGINE_LIMITS.shotMax),
      camera: camera.slice(0, VIDEO_ENGINE_LIMITS.cameraMax),
      duration: clampNumber(duration, 1, VIDEO_ENGINE_LIMITS.shotDurationMax),
    }
    if (beats && beats.length > 0) normalized.beats = beats
    shots.push(normalized)
    if (shots.length >= VIDEO_ENGINE_LIMITS.shotsMax) break
  }
  return shots.length > 0 ? shots : undefined
}

/**
 * beats[] 收敛：time/action 任一为空即非法先丢弃，再取前 6 条；每项 time ≤40、action ≤500。
 * @param {unknown} value
 * @returns {object[] | undefined}
 */
function _normalizeBeats (value) {
  if (!Array.isArray(value)) return undefined
  const beats = []
  for (const rawBeat of value) {
    if (!rawBeat || typeof rawBeat !== 'object' || Array.isArray(rawBeat)) continue
    const time = typeof rawBeat.time === 'string' ? rawBeat.time.trim() : ''
    const action = typeof rawBeat.action === 'string' ? rawBeat.action.trim() : ''
    if (!time || !action) continue
    beats.push({
      time: time.slice(0, VIDEO_ENGINE_LIMITS.beatTimeMax),
      action: action.slice(0, VIDEO_ENGINE_LIMITS.beatActionMax),
    })
    if (beats.length >= VIDEO_ENGINE_LIMITS.beatsPerShotMax) break
  }
  return beats.length > 0 ? beats : undefined
}

/**
 * 收尾参数行（可选能力，默认不改变既有输出；调用方显式启用）。
 * 语义：`Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.`；
 * aspect 默认 "16:9"、duration 默认 15、audio 默认 "SFX"、nonIp 默认 true。
 * 幂等：提示词已含 "NON-IP" 不重复追加；不修改原始 prompt。
 * 超长：按模板段从尾部丢弃可选段（保留 Photoreal./NON-IP. 段），再从头部截断 prompt 至预算内。
 * @param {string} src
 * @param {{ aspect?: string, duration?: number, audio?: string, nonIp?: boolean, maxLength?: number }} [options]
 * @returns {string}
 */
function appendVideoTrailer (src, options = {}) {
  const source = String(src || '')
  // 大小写不敏感 + 词边界幂等（对齐引擎 append_trailer 判据；xenon-ip 这类子串不误判已含标记）
  if (/(?<![A-Za-z0-9])non-ip/i.test(source)) return source

  const aspect = typeof options.aspect === 'string' && options.aspect.trim() ? options.aspect.trim() : '16:9'
  const durationRaw = Number(options.duration)
  // 整数化对齐引擎 build_tail（int(float(d))，5.5 → 5s），防跨仓尾行漂移
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 15
  const audio = typeof options.audio === 'string' && options.audio.trim() ? options.audio.trim() : 'SFX'
  const nonIp = options.nonIp !== undefined ? Boolean(options.nonIp) : true

  const essential = ['Photoreal.', ...(nonIp ? ['NON-IP.'] : [])].join(' ')
  const optional = [aspect + '.', duration + 's.', audio + ' only.']

  const maxLength = Number(options.maxLength)
  if (Number.isFinite(maxLength)) {
    // 截断形态：仅保留能完整放入预算的模板段（保证 NON-IP 段保留），
    // 最后一段去掉句点，保证以 NON-IP 结尾且无残缺模板段
    const kept = [...essential.split(' ')]
    for (const segment of optional) {
      const candidate = [...kept, segment].join(' ')
      if (source.length + 1 + candidate.length <= maxLength) kept.push(segment)
    }
    const lastSegment = kept[kept.length - 1]
    const trailer = (lastSegment && lastSegment.endsWith('.')
      ? kept.slice(0, -1).concat(lastSegment.slice(0, -1))
      : kept
    ).join(' ')
    const budget = maxLength - 1 - trailer.length
    const sourcePart = budget > 0 ? source.slice(-budget) : ''
    return (sourcePart + ' ' + trailer).trim()
  }

  return source + ' ' + [essential, ...optional].join(' ')
}

/**
 * 导演工作流结构完整性校验：声明 excluded_characters/no_swap_pairs 非空时，
 * 截断前 optimized_prompt 必须包含引用协议标记（<<< / [ABSENT]，大小写敏感，见 VIDEO_REFERENCE_MARKERS）。
 * 校验基于截断前原文，避免 maxLength 截断削掉尾部标记导致合法响应误报。
 * @param {unknown} result
 * @param {object | null} video - 已归一化的 video meta
 * @param {{ index?: number }} [opts]
 * @returns {string | null} 错误信息；通过返回 null
 */
function _assertReferenceProtocol (result, video, opts = {}) {
  if (!video) return null
  const declared = []
  if (Array.isArray(video.excluded_characters) && video.excluded_characters.length > 0) declared.push('excluded_characters')
  if (Array.isArray(video.no_swap_pairs) && video.no_swap_pairs.length > 0) declared.push('no_swap_pairs')
  if (declared.length === 0) return null
  const rawPrompt = result && typeof result === 'object' && typeof result.optimized_prompt === 'string'
    ? result.optimized_prompt
    : ''
  const hasMarker = VIDEO_REFERENCE_MARKERS.some(marker => rawPrompt.includes(marker))
  if (hasMarker) return null
  const label = opts.index === undefined ? '' : '场景 ' + opts.index + ' '
  return label + '视频优化响应声明了 ' + declared.join(' / ') + ' 但正文未包含引用协议标记（' + VIDEO_REFERENCE_MARKERS.join(' / ') + '）'
}

/**
 * 从 PromptBridge 响应提取视频优化结果并做 fail-closed 校验。
 * 共享内核 base（error → detail → 空串 → maxLength 截断，engineLabel=视频 保留既有文案）
 * + 导演工作流完整性校验（基于截断前文本）+ video 结构化字段收敛（越界收敛/缺失默认）。
 *
 * @param {unknown} result - PromptBridge._post 的解析结果
 * @param {{ index?: number, maxLength?: number, warn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, prompt: string, meta: object, video: object | null, engine_source: 'standalone-8020' | 'legacy-8013' | 'unknown', truncated: boolean } | { ok: false, error: string }}
 */
function extractOptimizedVideoPrompt (result, opts = {}) {
  const base = extractOptimizedBase(result, { ...opts, engineLabel: '视频' })
  if (!base.ok) return base
  const video = normalizeVideoMeta(result && typeof result === 'object' ? result.video : undefined)
  const integrityError = _assertReferenceProtocol(result, video, opts)
  if (integrityError) return { ok: false, error: integrityError }
  // PromptBridge 在响应外层附加的后端来源标记（不进入发送给引擎的 payload）
  const engineSource = result && typeof result === 'object' && !Array.isArray(result)
    ? (result._prompt_engine_backend === 'standalone-8020' || result._prompt_engine_backend === 'legacy-8013'
        ? result._prompt_engine_backend
        : 'unknown')
    : 'unknown'
  const meta = { ...base.meta, engine_source: engineSource }
  if (video) meta.video = video
  return { ok: true, prompt: base.prompt, meta, video, engine_source: engineSource, truncated: base.truncated }
}

module.exports = {
  VIDEO_PLATFORMS,
  VIDEO_PLATFORM_ALIASES,
  DEFAULT_VIDEO_PLATFORM,
  VIDEO_ENGINE_LIMITS,
  VIDEO_REFERENCE_MARKERS,
  PLATFORM_VIDEO_PROFILES,
  BUILT_IN_VIDEO_NO_TEXT_NEGATIVE,
  VIDEO_PLATFORM_LANGUAGE,
  MODEL_LANGUAGE_KEYWORDS,
  normalizeVideoDomain,
  normalizeVideoPlatform,
  normalizeVideoContext,
  normalizePrevFinalFrame,
  normalizeVideoMeta,
  getVideoProfile,
  appendVideoTrailer,
  languageFromVideoPlatform,
  languageFromVideoModel,
  buildVideoOptimizeRequest,
  buildStandaloneVideoOptimizeRequest,
  isStandaloneVideoEngineEnabled,
  getStandaloneVideoEngineTarget,
  extractOptimizedVideoPrompt,
}
