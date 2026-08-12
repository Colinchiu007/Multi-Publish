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

export const STORY2VIDEO_NOTIFICATION_MESSAGES = Object.freeze({
  zh: Object.freeze({
    [STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED]: '未找到需要的相关模型，请在设置中添加模型',
    [STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED]: '模型已添加，但 API Key 未配置或无法读取，请在「模型设置」中重新填写对应服务商的 API Key。',
    [STORY2VIDEO_NOTIFICATION_KEYS.BGM_SKIPPED]: '背景音乐已跳过（{reason}），成片不含背景音乐。',
    [STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED]: '当前登录状态无法启动全能创作，请先登录并确认当前账号有对应权益。',
    [STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED]: '暂时无法完成生成，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY]: '目前只支持输入文案。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG]: '文案最多可输入 {max} 个字符，请缩短后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED]: '请先输入视频文案。',
    [STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE]: '暂时无法获取生成进度，请在历史记录中查看。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING]: '生成已完成，但未找到可预览的视频，请在历史记录中查看。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID]: '所选文件不符合要求，请重新选择。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_FORMAT_INVALID]: '不支持 {extension} 格式。{kindLabel}仅支持：{extensions}。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_SIZE_EXCEEDED]: '{kindLabel}文件大小超出限制：最大 {maxMb}MB，当前文件约 {actualMb}MB，请压缩后重试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_UNREADABLE]: '无法读取所选{kindLabel}文件，请确认文件未被占用或已损坏后重试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_PATH_UNRESOLVED]: '无法获取所选{kindLabel}文件的本地路径，请重新选择文件后再试；若持续出现请重启应用。',
    [STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID]: '所选音色无效或已失效{reason}，请在「语音 / 音色 ID」中重新选择有效音色，或使用服务商默认音色。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_FAILED]: '项目未能删除，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_CONFIRM]: '确定删除当前项目及其本地产物吗？此操作无法撤销。',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEMPLATE_DELETE_CONFIRM]: '确定删除这个自定义模板吗？此操作无法撤销。',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED]: '历史记录暂时无法加载，请稍后再试。',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOCAL_MODE]: '当前为本地模式，仅显示本机记录。',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_COMPLETED]: 'ZIP 导出完成。',
    [STORY2VIDEO_NOTIFICATION_KEYS.SAVE_COMPLETED]: '文件已保存。',
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
    [STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED]: 'The model is configured, but its API key is missing or cannot be read. Re-enter the API key for the provider in Model Settings.',
    [STORY2VIDEO_NOTIFICATION_KEYS.BGM_SKIPPED]: 'Background music was skipped ({reason}). The video has no background music.',
    [STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED]: 'Sign in with an account that can access Omni Creation, then try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED]: 'Could not finish generation right now. Please try again shortly.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY]: 'Only text input is supported.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG]: 'Your script can contain up to {maxFormatted} characters. Please shorten it and try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED]: 'Enter a video script before continuing.',
    [STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE]: 'The generation progress is unavailable. Check History for details.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING]: 'Generation finished, but no previewable video was found. Check History for details.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID]: 'The selected file does not meet the requirements. Please choose another file.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_FORMAT_INVALID]: 'The {extension} format is not supported. {kindLabel} supports only: {extensions}.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_SIZE_EXCEEDED]: '{kindLabel} exceeds the size limit: up to {maxMb} MB, this file is about {actualMb} MB. Compress it and try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_UNREADABLE]: 'Could not read the selected {kindLabel} file. Make sure it is not locked or corrupted, then try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_PATH_UNRESOLVED]: 'Could not resolve the local path of the selected {kindLabel} file. Choose it again; if this keeps happening, restart the app.',
    [STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID]: 'The selected voice is invalid or no longer available{reason}. Choose another voice in Voice / Voice ID, or use the provider default.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_FAILED]: 'The project could not be deleted. Please try again.',
    [STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_CONFIRM]: 'Delete this project and its local output? This cannot be undone.',
    [STORY2VIDEO_NOTIFICATION_KEYS.TEMPLATE_DELETE_CONFIRM]: 'Delete this custom template? This cannot be undone.',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED]: 'History is unavailable right now. Please try again shortly.',
    [STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOCAL_MODE]: 'Local mode — showing records on this device only.',
    [STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_COMPLETED]: 'Your ZIP export is ready.',
    [STORY2VIDEO_NOTIFICATION_KEYS.SAVE_COMPLETED]: 'The file has been saved.',
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
const QUOTA_EXCEEDED_PATTERN = /((?:insufficient|exhausted|exceeded|out\s+of).{0,40}(?:quota|balance|token|credit)|(?:quota|balance|token|credit)s?.{0,40}(?:exceeded|insufficient|exhausted)|(?:余额|额度|配额).{0,20}(?:不足|不够|超|耗尽)|insufficient\s+balance|billing|payment\s+required)/i
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
  return normalizeStory2VideoLocale(locale) === 'en'
    ? {
        dialogTitle: 'Notice',
        acknowledge: 'Got it',
        cancel: 'Cancel',
        confirmDelete: 'Delete',
        resume: 'Resume from breakpoint',
        resuming: 'Resuming…',
        resumeHint: 'The pipeline can continue from the failed stage. Temporary service or network issues will be retried automatically after a short wait.',
      }
    : {
        dialogTitle: '提示',
        acknowledge: '知道了',
        cancel: '取消',
        confirmDelete: '删除',
        resume: '从断点继续',
        resuming: '正在恢复…',
        resumeHint: '可从上一步失败的阶段继续生成；遇到暂时的服务繁忙或网络波动时，会自动等待片刻后重试。',
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
  if (MODEL_API_KEY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED
  if (MODEL_CONFIGURATION_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED
  if (TEXT_ONLY_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY
  if (TEXT_TOO_LONG_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG
  if (PREVIEW_MISSING_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING
  if (VOICE_INVALID_PATTERN.test(raw)) return STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID
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

// compose 的 bgmSkippedReason → 本地化原因文案（未知 code 回退 unreadable）。
const BGM_SKIP_REASON_TEXT = Object.freeze({
  zh: Object.freeze({
    size_exceeded: '文件超过大小上限',
    format_unsupported: '格式不支持',
    not_allowed: '文件不在允许的读取范围',
    unreadable: '文件不存在或不可读',
  }),
  en: Object.freeze({
    size_exceeded: 'file exceeds the size limit',
    format_unsupported: 'format not supported',
    not_allowed: 'file is outside the allowed locations',
    unreadable: 'file is missing or unreadable',
  }),
})

export function bgmSkippedReasonText (reason, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const reasons = BGM_SKIP_REASON_TEXT[normalizedLocale] || BGM_SKIP_REASON_TEXT.zh
  return reasons[reason] || reasons.unreadable
}

/** 由 compose 的 bgmSkippedReason 生成完整通知（key + 本地化消息）。 */
export function formatBgmSkippedNotification (reason, locale = getStory2VideoLocale()) {
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const key = STORY2VIDEO_NOTIFICATION_KEYS.BGM_SKIPPED
  const message = messageFor(key, { reason: bgmSkippedReasonText(reason, normalizedLocale) }, normalizedLocale)
  return { messageKey: key, message, codePointCount: countUnicodeCodePoints(message) }
}

const HISTORY_DETAIL_PATTERNS = Object.freeze({
  zh: [
    { pattern: /无法识别当前用户|未登录|登录已过期|login|not signed/i, detail: '当前未登录或登录已过期。请登录后重试；未登录时仅显示本机记录。' },
    { pattern: /存储不可用|存储不可写|项目存储|store (unavailable|not)|storage (not )?(writable|ready)|storage failed/i, detail: '本地存储异常。请重启应用后重试；若持续出现请检查本地磁盘空间与权限。' },
    { pattern: /超时|timeout|timed out/i, detail: '加载超时。请关闭后重新进入历史记录重试；若持续出现请重启应用。' },
  ],
  en: [
    { pattern: /cannot identify|not signed|login|sign in|无法识别当前用户|未登录|登录已过期/i, detail: 'You are not signed in or your session expired. Sign in to retry; local records remain available offline.' },
    { pattern: /store (unavailable|not)|storage (not )?(writable|ready)|storage failed|存储不可用|存储不可写|项目存储/i, detail: 'Local storage is having issues. Restart the app to retry; if it persists, check local disk space and permissions.' },
    { pattern: /timeout|timed out|超时/i, detail: 'Loading timed out. Close and reopen the history list to retry; if it persists, restart the app.' },
  ],
})

/**
 * 历史记录加载失败时，按具体原因生成可操作建议（供错误弹窗 detail 行展示）。
 * 无法识别的原因返回空串（不展示 detail，避免把内部错误文本直接暴露给用户）。
 * @param {string|undefined|null} message - 主进程返回的原始错误 message（IPC result.message / reject reason）
 * @param {string} [locale]
 * @returns {string}
 */
export function historyLoadFailureDetail (message, locale = getStory2VideoLocale()) {
  const raw = String(message || '').trim()
  if (!raw) return ''
  const normalizedLocale = normalizeStory2VideoLocale(locale)
  const rules = HISTORY_DETAIL_PATTERNS[normalizedLocale] || HISTORY_DETAIL_PATTERNS.zh
  const matched = rules.find(rule => rule.pattern.test(raw))
  return matched ? matched.detail : ''
}

export function resolveStory2VideoNotification (notification = {}, options = {}) {
  const normalizedLocale = normalizeStory2VideoLocale(options.locale || getStory2VideoLocale())
  const key = resolveMessageKey(notification, STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED)
  const rawError = String(notification?.error || notification?.message || '')
  const params = normalizeParams(notification?.messageParams || notification?.errorParams, normalizedLocale, key, rawError)
  return { key, params, message: messageFor(key, params, normalizedLocale) }
}
