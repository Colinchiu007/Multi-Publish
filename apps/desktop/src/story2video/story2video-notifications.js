export const MAX_STORY2VIDEO_TEXT_CHARACTERS = 6000

export const STORY2VIDEO_NOTIFICATION_KEYS = Object.freeze({
  MODEL_CONFIGURATION_REQUIRED: 'story2video.model_configuration_required',
  ACCESS_DENIED: 'story2video.access_denied',
  ORCHESTRATION_FAILED: 'story2video.orchestration_failed',
  TEXT_INPUT_ONLY: 'story2video.text_input_only',
  TEXT_TOO_LONG: 'story2video.text_too_long',
  TEXT_REQUIRED: 'story2video.text_required',
  RUN_STATUS_UNAVAILABLE: 'story2video.run_status_unavailable',
  PREVIEW_MISSING: 'story2video.preview_missing',
  MEDIA_INVALID: 'story2video.media_invalid',
  PROJECT_DELETE_FAILED: 'story2video.project_delete_failed',
  PROJECT_DELETE_CONFIRM: 'story2video.project_delete_confirm',
  TEMPLATE_DELETE_CONFIRM: 'story2video.template_delete_confirm',
  HISTORY_LOAD_FAILED: 'story2video.history_load_failed',
  EXPORT_COMPLETED: 'story2video.export_completed',
  EXPORT_CANCELLED: 'story2video.export_cancelled',
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

export const STORY2VIDEO_NOTIFICATION_MESSAGES = Object.freeze({
  zh: Object.freeze({
    [STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED]: '未找到需要的相关模型，请在设置中添加模型',
    [STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED]: '当前登录状态无法启动图片轮播，请先登录并确认当前账号有对应权益。',
    [STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED]: '暂时无法完成生成，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY]: '目前只支持输入文案。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG]: '文案最多可输入 {max} 个字符，请缩短后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED]: '请先输入视频文案。',
    [STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE]: '暂时无法获取生成进度，请在历史记录中查看。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING]: '生成已完成，但未找到可预览的视频，请在历史记录中查看。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID]: '所选文件不符合要求，请重新选择。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_FAILED]: '项目未能删除，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_CONFIRM]: '确定删除当前项目及其本地产物吗？此操作无法撤销。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEMPLATE_DELETE_CONFIRM]: '确定删除这个自定义模板吗？此操作无法撤销。',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED]: '历史记录暂时无法加载，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_COMPLETED]: 'ZIP 导出完成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_CANCELLED]: '已取消导出。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PATH_COPIED]: '已复制视频文件位置。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TRIM_COMPLETED]: '裁剪片段已生成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENTS_SAVED]: '分段已保存。',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_AUDIO_REPLACED]: '旁白已替换，请重新合成项目。',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_IMAGE_RETRIED]: '图片已重新生成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_VIDEO_RETRIED]: '分段视频已重新生成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_RECOMPOSED]: '项目已重新合成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING]: '此成片包含离线降级素材（{kinds}），请在发布前预览确认。',
    [STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED]: '生成受频率或额度限制{sceneText}，请稍等片刻后重试；若持续出现，请检查对应模型账号的套餐额度。',
    [STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED]: '模型 API 的额度或余额已用完{sceneText}，请检查对应账号的套餐额度，或更换模型后从断点继续。',
    [STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED]: '当前操作未能完成，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR]: '当前操作未能完成，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_NOT_IMPLEMENTED]: '该流水线尚未实现执行引擎，暂不能生成视频。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT]: '当前已有 {count} 条流水线正在后台运行，最多同时运行 {max} 条，请等待其中一条完成后再启动。',
  }),
  en: Object.freeze({
    [STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED]: 'The required models are not available. Add them in Settings.',
    [STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED]: 'Sign in with an account that can access the image carousel pipeline, then try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED]: 'Could not finish generation right now. Please try again shortly.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY]: 'Only text input is supported.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG]: 'Your script can contain up to {maxFormatted} characters. Please shorten it and try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED]: 'Enter a video script before continuing.',
    [STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE]: 'The generation progress is unavailable. Check History for details.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING]: 'Generation finished, but no previewable video was found. Check History for details.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID]: 'The selected file does not meet the requirements. Please choose another file.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_FAILED]: 'The project could not be deleted. Please try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_CONFIRM]: 'Delete this project and its local output? This cannot be undone.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEMPLATE_DELETE_CONFIRM]: 'Delete this custom template? This cannot be undone.',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED]: 'History is unavailable right now. Please try again shortly.',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_COMPLETED]: 'Your ZIP export is ready.',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_CANCELLED]: 'Export was cancelled.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PATH_COPIED]: 'The video file location was copied.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TRIM_COMPLETED]: 'Your trimmed video clip is ready.',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENTS_SAVED]: 'Your segments were saved.',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_AUDIO_REPLACED]: 'Narration was replaced. Recompose the project to update the video.',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_IMAGE_RETRIED]: 'The image was generated again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_VIDEO_RETRIED]: 'The segment video was generated again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_RECOMPOSED]: 'Your project was recomposed.',
    [STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING]: 'This video contains offline fallback assets ({kinds}). Preview it before publishing.',
    [STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED]: 'Generation is rate limited{sceneText}. Wait a moment and try again, or check your provider plan quota.',
    [STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED]: 'The model API quota or balance is exhausted{sceneText}. Check your provider plan, or switch models and resume from the breakpoint.',
    [STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED]: 'Could not complete the request. Please try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR]: 'Could not complete the request. Please try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_NOT_IMPLEMENTED]: 'This pipeline has no execution engine yet, so videos cannot be generated.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT]: '{count} pipelines are already running in the background. Up to {max} can run at once. Wait for one to finish before starting another.',
  }),
})

const notificationKeySet = new Set(Object.values(STORY2VIDEO_NOTIFICATION_KEYS))

const DEGRADED_ASSET_LABELS = Object.freeze({
  zh: Object.freeze({ placeholder_image: '占位图片', silent_narration: '静音旁白' }),
  en: Object.freeze({ placeholder_image: 'placeholder images', silent_narration: 'silent narration' }),
})
const MODEL_CONFIGURATION_PATTERN = /(默认\s*LLM|默认.*模型|未找到.*(?:默认.*)?(?:LLM|模型)|模型.*不可用|api\s*key\s*not\s*configured|(?:尚未配置|未配置|未设置).*api\s*key)/i
const ACCESS_DENIED_PATTERN = /(当前许可证无权访问|当前账号没有所需权益|未授权|未登录|需要登录|access denied|not authorized|permission denied|sign[ -]?in required)/i
const RATE_LIMITED_PATTERN = /(rate\s*limit|rate_limit|限流|频率.*(?:受限|限制)|too\s*many\s*requests)/i
const QUOTA_EXCEEDED_PATTERN = /((?:insufficient|exhausted|exceeded|out\s+of).{0,40}(?:quota|balance|token|credit)|(?:quota|balance|token|credit)s?.{0,40}(?:exceeded|insufficient|exhausted)|(?:余额|额度|配额).{0,20}(?:不足|不够|超|耗尽)|insufficient\s+balance|billing|payment\s+required)/i
const TEXT_ONLY_PATTERN = /(只支持\s*(?:text|文案)|text\s*mode|text input only)/i
const TEXT_TOO_LONG_PATTERN = /(超过\s*6000|最多\s*6000|6000.*(?:字符|character)|text.*(?:too long|exceeds))/i
const PREVIEW_MISSING_PATTERN = /(未返回.*可预览.*视频|preview.*(?:missing|video)|no previewable video)/i
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
  const safeName = String(pipelineDisplayName || '').trim()
  return normalizeStory2VideoLocale(locale) === 'en'
    ? {
        dialogTitle: (safeName || 'Image Carousel') + ' Notice',
        acknowledge: 'Got it',
        cancel: 'Cancel',
        confirmDelete: 'Delete',
        resume: 'Resume from breakpoint',
        resuming: 'Resuming…',
        resumeHint: 'The pipeline can continue from the failed stage. Transient failures will be retried with cooldown automatically.',
      }
    : {
        dialogTitle: (safeName || '图片轮播') + ' 提示',
        acknowledge: '知道了',
        cancel: '取消',
        confirmDelete: '删除',
        resume: '从断点继续',
        resuming: '正在恢复…',
        resumeHint: '可从上一步失败的阶段继续生成；瞬时错误（限流/超时）会自动冷却后重试。',
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

  if (messageKey === STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING && Array.isArray(supplied.assetKinds)) {
    const labels = DEGRADED_ASSET_LABELS[locale]
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
  if (MODEL_CONFIGURATION_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED
  if (TEXT_ONLY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY
  if (TEXT_TOO_LONG_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG
  if (PREVIEW_MISSING_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING
  return fallbackKey
}

function messageFor (key, params, locale) {
  const messages = STORY2VIDEO_NOTIFICATION_MESSAGES[locale]
  return interpolateMessage(messages[key] || messages[STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR], params)
}

export function formatStory2VideoNotification (notification = {}, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const messageKey = resolveMessageKey(notification, STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR)
  const rawError = String(notification?.error || notification?.message || '')
  const params = normalizeParams(notification?.messageParams || notification?.errorParams, normalizedLocale, messageKey, rawError)
  const message = messageFor(messageKey, params, normalizedLocale)
  return { messageKey, message, codePointCount: countUnicodeCodePoints(message) }
}

export function resolveStory2VideoNotification (notification = {}, options = {}) {
  const normalizedLocale = normalizeStory2VideoLocale(options.locale || getStory2VideoLocale())
  const key = resolveMessageKey(notification, STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED)
  const rawError = String(notification?.error || notification?.message || '')
  const params = normalizeParams(notification?.messageParams || notification?.errorParams, normalizedLocale, key, rawError)
  return { key, params, message: messageFor(key, params, normalizedLocale) }
}
