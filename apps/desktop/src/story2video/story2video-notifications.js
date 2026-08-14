import zhLocale from '@/locales/zh'
import enLocale from '@/locales/en'

export const MAX_STORY2VIDEO_TEXT_CHARACTERS = 6000

export const STORY2VIDEO_NOTIFICATION_KEYS = Object.freeze({
  MODEL_CONFIGURATION_REQUIRED: 'story2video.model_configuration_required',
  MODEL_API_KEY_REQUIRED: 'story2video.model_api_key_required',
  BGM_SKIPPED: 'story2video.bgm_skipped',
  ACCESS_DENIED: 'story2video.access_denied',
  ORCHESTRATION_FAILED: 'story2video.orchestration_failed',
  TEXT_INPUT_ONLY: 'story2video.text_input_only',
  TEXT_TOO_LONG: 'story2video.text_too_long',
  TEXT_REQUIRED: 'story2video.text_required',
  RUN_STATUS_UNAVAILABLE: 'story2video.run_status_unavailable',
  PREVIEW_MISSING: 'story2video.preview_missing',
  MEDIA_INVALID: 'story2video.media_invalid',
  MEDIA_FORMAT_INVALID: 'story2video.media_format_invalid',
  MEDIA_SIZE_EXCEEDED: 'story2video.media_size_exceeded',
  MEDIA_UNREADABLE: 'story2video.media_unreadable',
  MEDIA_PATH_UNRESOLVED: 'story2video.media_path_unresolved',
  VOICE_INVALID: 'story2video.voice_invalid',
  PROJECT_DELETE_FAILED: 'story2video.project_delete_failed',
  PROJECT_DELETE_CONFIRM: 'story2video.project_delete_confirm',
  TEMPLATE_DELETE_CONFIRM: 'story2video.template_delete_confirm',
  BGM_LIBRARY_LOAD_FAILED: 'story2video.bgm_library_load_failed',
  BGM_LIBRARY_RENAME_FAILED: 'story2video.bgm_library_rename_failed',
  BGM_LIBRARY_DELETE_FAILED: 'story2video.bgm_library_delete_failed',
  BGM_LIBRARY_DELETE_CONFIRM: 'story2video.bgm_library_delete_confirm',
  HISTORY_LOAD_FAILED: 'story2video.history_load_failed',
  HISTORY_LOCAL_MODE: 'story2video.history_local_mode',
  EXPORT_COMPLETED: 'story2video.export_completed',
  EXPORT_CANCELLED: 'story2video.export_cancelled',
  SAVE_COMPLETED: 'story2video.save_completed',
  PATH_COPIED: 'story2video.path_copied',
  TRIM_COMPLETED: 'story2video.trim_completed',
  SEGMENTS_SAVED: 'story2video.segments_saved',
  SEGMENT_AUDIO_REPLACED: 'story2video.segment_audio_replaced',
  SEGMENT_IMAGE_RETRIED: 'story2video.segment_image_retried',
  SEGMENT_VIDEO_RETRIED: 'story2video.segment_video_retried',
  PROJECT_RECOMPOSED: 'story2video.project_recomposed',
  DEGRADED_ASSETS_WARNING: 'story2video.degraded_assets_warning',
  RATE_LIMITED: 'story2video.rate_limited',
  QUOTA_EXCEEDED: 'story2video.quota_exceeded',
  OPERATION_FAILED: 'story2video.operation_failed',
  UNKNOWN_ERROR: 'story2video.unknown_error',
  PIPELINE_NOT_IMPLEMENTED: 'story2video.pipeline_not_implemented',
  PIPELINE_CONCURRENCY_LIMIT: 'story2video.pipeline_concurrency_limit',
})

const notificationKeySet = new Set(Object.values(STORY2VIDEO_NOTIFICATION_KEYS))

/**
 * i18n-content-sync（2026-08-13）：用户可见文案单一事实源 = locales/{zh,en}.js。
 * 本模块不再持有任何 zh/en 文案，只保留：稳定 key 常量、错误归一化正则、参数归一化与插值逻辑。
 * 新增文案一律写入 locales（zh/en 成对），见 openspec/specs/i18n-content-sync/spec.md。
 */
const LOCALE_TREES = Object.freeze({ zh: zhLocale, en: enLocale })

/** 从 locale 原始语料树读取 key 的模板串；函数式消息（如进度插值）返回 undefined，模块不使用。 */
function localeMessageSource (locale, key) {
  const tree = LOCALE_TREES[normalizeStory2VideoLocale(locale)] || LOCALE_TREES.zh
  const leaf = String(key).split('.').reduce(
    (acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined),
    tree
  )
  return typeof leaf === 'string' ? leaf : undefined
}

// API Key 未配置/未设置/缺失/解密失败 → 独立提示（2026-08-09：避免被归一化成「未找到模型」误导排查）。
// 拆分为命名子模式便于维护；decrypt failed/解密失败 仅在 api-key 上下文内匹配，避免把非 key 解密错误误归类。
const API_KEY_UNCONFIGURED_PATTERN = /(api\s*key\s*not\s*configured|(?:尚未配置|未配置|未设置).{0,12}api\s*key|api\s*key.{0,12}(?:not\s*configured|未配置))/i
const API_KEY_MISSING_PATTERN = /(missing api key|api key required|no api key|api key.{0,16}(?:missing|required|not found|未找到))/i
const API_KEY_DECRYPT_PATTERN = /(api[ _-]?key.{0,20}(?:decrypt failed|解密失败)|(?:decrypt failed|解密失败).{0,20}api[ _-]?key)/i
const MODEL_API_KEY_PATTERN = new RegExp('(?:' + [
  API_KEY_UNCONFIGURED_PATTERN.source,
  API_KEY_MISSING_PATTERN.source,
  API_KEY_DECRYPT_PATTERN.source,
].join('|') + ')', 'i')
const MODEL_CONFIGURATION_PATTERN = /(默认\s*LLM|默认.*模型|未找到.*(?:默认.*)?(?:LLM|模型)|模型.*不可用)/i
const ACCESS_DENIED_PATTERN = /(当前许可证无权访问|当前账号没有所需权益|未授权|未登录|需要登录|access denied|not authorized|permission denied|sign[ -]?in required)/i
const RATE_LIMITED_PATTERN = /(rate\s*limit|rate_limit|限流|频率.*(?:受限|限制)|too\s*many\s*requests)/i
const QUOTA_EXCEEDED_PATTERN = /((?:insufficient|exhausted|exceeded|out\s+of).{0,40}(?:quota|balance|token|credit)|(?:quota|balance|token|credit)s?.{0,40}(?:exceeded|insufficient|exhausted)|(?:余额|额度|配额).{0,20}(?:不足|不够|超|耗尽)|insufficient\s*balance|billing|payment\s*required)/i
const TEXT_ONLY_PATTERN = /(只支持\s*(?:text|文案)|text\s*mode|text input only)/i
const TEXT_TOO_LONG_PATTERN = /(超过\s*6000|最多\s*6000|6000.*(?:字符|character)|text.*(?:too long|exceeds))/i
const PREVIEW_MISSING_PATTERN = /(未返回.*可预览.*视频|preview.*(?:missing|video)|no previewable video)/i
const VOICE_INVALID_PATTERN = /(voice id wrong|invalid params.*voice|voice_id.*(?:invalid|wrong|not found|not exist|unsupported)|voice.*(?:not found|does not exist|invalid|unavailable)|音色.*(?:无效|不存在|失效|错误))/i
const PIPELINE_CONCURRENCY_PATTERN = /(流水线正在(?:后台)?运行|最多同时运行|同时运行.*条|concurrency limit)/i
export function countUnicodeCodePoints (value) {
  return Array.from(String(value ?? '')).length
}

export const countStory2VideoTextCharacters = countUnicodeCodePoints

export function normalizeStory2VideoLocale (locale) {
  return String(locale || '').trim().toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function getStory2VideoLocale () {
  if (typeof window === 'undefined') return 'zh'
  return normalizeStory2VideoLocale(window.localStorage?.getItem('locale'))
}

export function getStory2VideoNotificationUiText (locale = getStory2VideoLocale(), pipelineDisplayName = '') {
  // 弹窗标题统一为「提示」/「Notice」：去掉流水线名前缀（如「图片轮播 提示」→「提示」），
  // 具体内容在消息正文中体现，避免标题重复流水线名词（2026-08-08 UX 规范）。
  const safeName = String(pipelineDisplayName || '').trim()
  void safeName
  const read = (suffix) => localeMessageSource(locale, `story2video.dialog.${suffix}`) || ''
  return {
    dialogTitle: read('title'),
    acknowledge: read('acknowledge'),
    cancel: read('cancel'),
    confirmDelete: read('confirmDelete'),
    resume: read('resume'),
    resuming: read('resuming'),
    resumeHint: read('resumeHint'),
  }
}

function extractSceneNumber (rawError) {
  const match = String(rawError || '').match(/scene\s+(\d+)/i)
  return match ? Number(match[1]) : null
}

function normalizeParams (value, locale, messageKey, rawError) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const params = {}

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG && Number.isFinite(Number(supplied.max))) {
    params.max = Number(supplied.max)
    params.maxFormatted = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN').format(params.max)
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_FORMAT_INVALID) {
    params.extension = String(supplied.extension || '').trim() || '该'
    params.kindLabel = String(supplied.kindLabel || '').trim() || ''
    params.extensions = Array.isArray(supplied.extensions) ? supplied.extensions.join(' / ') : String(supplied.extensions || '')
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_SIZE_EXCEEDED) {
    params.kindLabel = String(supplied.kindLabel || '').trim() || ''
    if (Number.isFinite(Number(supplied.maxMb))) params.maxMb = Math.round(Number(supplied.maxMb))
    if (Number.isFinite(Number(supplied.actualMb))) params.actualMb = Math.max(1, Math.round(Number(supplied.actualMb)))
  }

  if (
    messageKey === STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_UNREADABLE ||
    messageKey === STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_PATH_UNRESOLVED
  ) {
    params.kindLabel = String(supplied.kindLabel || '').trim() || ''
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID) {
    const rawReason = String(supplied.reason || rawError || '').trim()
    params.reason = rawReason ? '（' + rawReason.slice(0, 160) + '）' : ''
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING && Array.isArray(supplied.assetKinds)) {
    const labels = LOCALE_TREES[locale].story2video.degradedAssetLabels
    const separator = locale === 'en' ? ', ' : '、'
    params.kinds = supplied.assetKinds
      .map(kind => labels[kind] || '')
      .filter(Boolean)
      .join(separator)
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT) {
    if (Number.isFinite(Number(supplied.count))) params.count = Number(supplied.count)
    if (Number.isFinite(Number(supplied.max))) params.max = Number(supplied.max)
  }

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED || messageKey === STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED) {
    const scene = extractSceneNumber(rawError)
    if (scene !== null) {
      params.sceneText = locale === 'en' ? ' (scene ' + scene + ')' : '（第 ' + scene + ' 个场景）'
    } else if (typeof supplied.sceneText === 'string') {
      params.sceneText = supplied.sceneText
    } else {
      params.sceneText = ''
    }
  }

  return params
}
function interpolateMessage (template, params) {
  return template.replace(/\{([^{}]+)\}/g, (_placeholder, name) => String(params[name] ?? ''))
}

function isKnownMessageKey (key) {
  return notificationKeySet.has(key)
}

function resolveMessageKey (notification, fallbackKey) {
  const suppliedKey = notification?.messageKey || notification?.errorCode
  if (isKnownMessageKey(suppliedKey)) return suppliedKey

  const raw = String(notification?.error || notification?.message || '').trim()
  if (Number(notification?.code) === -3 || Number(notification?.errorCode) === -3) return STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED
  if (ACCESS_DENIED_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED
  if (notification?.errorCode === 'RATE_LIMITED' || Number(notification?.code) === 429 || RATE_LIMITED_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED
  if (notification?.errorCode === 'QUOTA_EXCEEDED' || Number(notification?.code) === 402 || QUOTA_EXCEEDED_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED
  if (notification?.errorCode === 'PIPELINE_CONCURRENCY_LIMIT' || PIPELINE_CONCURRENCY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT
  if (MODEL_API_KEY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED
  if (MODEL_CONFIGURATION_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED
  if (TEXT_ONLY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY
  if (TEXT_TOO_LONG_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG
  if (PREVIEW_MISSING_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING
  if (VOICE_INVALID_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID
  return fallbackKey
}

function messageFor (key, params, locale) {
  const template = localeMessageSource(locale, key) ||
    localeMessageSource(locale, STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR)
  return interpolateMessage(template, params)
}

export function formatStory2VideoNotification (notification = {}, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const messageKey = resolveMessageKey(notification, STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR)
  const rawError = String(notification?.error || notification?.message || '')
  const params = normalizeParams(notification?.messageParams || notification?.errorParams, normalizedLocale, messageKey, rawError)
  const message = messageFor(messageKey, params, normalizedLocale)
  return { messageKey, message, codePointCount: countUnicodeCodePoints(message) }
}

/** compose 的 bgmSkippedReason → 本地化原因文案（未知 code 回退 unreadable）。文案在 locales story2video.bgmSkipReasons。 */
export function bgmSkippedReasonText (reason, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const reasons = LOCALE_TREES[normalizedLocale].story2video.bgmSkipReasons
  return reasons[reason] || reasons.unreadable
}

/** 由 compose 的 bgmSkippedReason 生成完整通知（key + 本地化消息）。 */
export function formatBgmSkippedNotification (reason, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const key = STORY2VIDEO_NOTIFICATION_KEYS.BGM_SKIPPED
  const message = messageFor(key, { reason: bgmSkippedReasonText(reason, normalizedLocale) }, normalizedLocale)
  return { messageKey: key, message, codePointCount: countUnicodeCodePoints(message) }
}

const HISTORY_DETAIL_RULES = Object.freeze({
  zh: [
    { pattern: /无法识别当前用户|未登录|登录已过期|login|not signed/i, detailKey: 'login' },
    { pattern: /存储不可用|存储不可写|项目存储|store (unavailable|not)|storage (not )?(writable|ready)|storage failed/i, detailKey: 'storage' },
    { pattern: /超时|timeout|timed out/i, detailKey: 'timeout' },
  ],
  en: [
    { pattern: /cannot identify|not signed|login|sign in|无法识别当前用户|未登录|登录已过期/i, detailKey: 'login' },
    { pattern: /store (unavailable|not)|storage (not )?(writable|ready)|storage failed|存储不可用|存储不可写|项目存储/i, detailKey: 'storage' },
    { pattern: /timeout|timed out|超时/i, detailKey: 'timeout' },
  ],
})

/**
 * 历史记录加载失败时，按具体原因生成可操作建议（供错误弹窗 detail 行展示）。
 * 无法识别的原因返回空串（不展示 detail，避免把内部错误文本直接暴露给用户）。
 * 建议文案在 locales story2video.historyDetail（zh/en 成对）。
 * @param {string|undefined|null} message - 主进程返回的原始错误 message（IPC result.message / reject reason）
 * @param {string} [locale]
 * @returns {string}
 */
export function historyLoadFailureDetail (message, locale = getStory2VideoLocale()) {
  const raw = String(message || '').trim()
  if (!raw) return ''
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const rules = HISTORY_DETAIL_RULES[normalizedLocale] || HISTORY_DETAIL_RULES.zh
  const matched = rules.find(rule => rule.pattern.test(raw))
  if (!matched) return ''
  return localeMessageSource(normalizedLocale, `story2video.historyDetail.${matched.detailKey}`) || ''
}

export function resolveStory2VideoNotification (notification = {}, options = {}) {
  const normalizedLocale = normalizeStory2VideoLocale(options.locale || getStory2VideoLocale())
  const key = resolveMessageKey(notification, STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED)
  const rawError = String(notification?.error || notification?.message || '')
  const params = normalizeParams(notification?.messageParams || notification?.errorParams, normalizedLocale, key, rawError)
  return { key, params, message: messageFor(key, params, normalizedLocale) }
}
