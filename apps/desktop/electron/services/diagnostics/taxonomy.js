// @ts-check
/**
 * 视频创作失败诊断 —— 统一诊断码 taxonomy
 *
 * 纯常量 + 纯函数，无任何服务依赖；输入缺失/非法时 fail-closed 归入 unknown 桶，
 * 保持输出结构稳定且绝不抛错。分类结果用于：诊断摘要、根因映射、后续聚合与展示。
 */
'use strict'

/** 流水线阶段（与 story2video 阶段定义对齐；preflight 为入口校验等非阶段失败占位） */
const DIAG_STAGES = Object.freeze([
  'preflight',
  'split',
  'domain_enrich',
  'optimize',
  'generate_assets',
  'compose',
  'publish',
  'scene_context',
  'select_video_scenes',
])

/** 失败类型 */
const DIAG_FAILURE_TYPES = Object.freeze([
  'validation',
  'transient',
  'provider',
  'infrastructure',
  'timeout',
  'resource',
  'media',
  'content_policy',
  'partial_degradation',
  'unknown',
])

/** 严重度 */
const DIAG_SEVERITY = Object.freeze([
  'blocker',
  'major',
  'minor',
  'info',
])

/** 可恢复性 */
const DIAG_RECOVERABILITY = Object.freeze([
  'retryable',
  'degradable',
  'checkpoint',
  'needs_user_input',
  'permanent',
  'unknown',
])

const UNKNOWN = 'unknown'

/** 阶段别名归一（兼容 run.stages 中英文/带空格等形态） */
const STAGE_ALIASES = Object.freeze({
  preflight: 'preflight',
  split: 'split',
  domain_enrich: 'domain_enrich',
  'domain-enrich': 'domain_enrich',
  optimize: 'optimize',
  generate_assets: 'generate_assets',
  'generate-assets': 'generate_assets',
  compose: 'compose',
  publish: 'publish',
  scene_context: 'scene_context',
  select_video_scenes: 'select_video_scenes',
})

function normalizeStage (value) {
  if (typeof value !== 'string') return UNKNOWN
  const key = value.trim().toLowerCase()
  return STAGE_ALIASES[key] || UNKNOWN
}

function _text (...values) {
  return values
    .filter(v => typeof v === 'string' && v)
    .join(' ')
}

/**
 * 从错误码/数值码/文本判定失败类型（优先级从强到弱；未命中返回 unknown）
 * @param {{ errorCode?: unknown, code?: unknown, message?: unknown }} input
 * @returns {string}
 */
function classifyFailureType (input) {
  const errorCode = typeof input.errorCode === 'string' ? input.errorCode : ''
  const codeText = input.code !== undefined && input.code !== null ? String(input.code) : ''
  const message = _text(input.message, input.error)
  const text = errorCode + ' ' + codeText + ' ' + message

  // 1. 内容政策（优先于通用 provider/文本规则）
  if (/内容.*(政策|审核|违规|不雅|露骨)|content\s*policy|改写(该)?场景|该场景.*(改写|抽象)/i.test(text)) {
    return 'content_policy'
  }
  // 2. 资源不足（磁盘/缓冲）
  if (/ENOSPC|ERR_NO_BUFFER_SPACE|no space left|磁盘|disk space|insufficient storage|buffer space/i.test(text)) {
    return 'resource'
  }
  // 3. 超时（provider/编码/网络均可命中；显式超时标记优先于 ffmpeg/媒体规则）
  if (/ETIMEDOUT|timed\s*out|\btimeout\b|超时|TIMEOUT/i.test(text)) {
    return 'timeout'
  }
  // 4. 媒体/ffmpeg
  if (/ffmpeg|ffprobe|Output file is empty|Output file|Cannot find a valid|Invalid data found|decode|编码|解码/i.test(text)) {
    return 'media'
  }
  // 5. 瞬态网络
  if (/ECONNRESET|socket hang up|fetch failed|EAI_AGAIN|network error|网络连接|网络错误/i.test(text)) {
    return 'transient'
  }
  // 6. 基础设施（sidecar/端口/进程）
  if (/ECONNREFUSED|connection refused|not running|端口|sidecar|bridge|SPLITTER|8002|8013/i.test(text)) {
    return 'infrastructure'
  }
  // 7. provider（限流/配额/未配置/适配器）
  if (/PROVIDER|RATE_LIMITED|QUOTA|ADAPTER_NOT_FOUND|PROVIDER_NOT_FOUND|API_KEY|api\s*key|429|402|rate limit|quota|限流|额度/i.test(text)) {
    return 'provider'
  }
  // 8. 参数校验
  if (/VALIDATION|validation|参数无效|Invalid (input|initialContext|Pipeline)|\bInvalid\b/i.test(text)) {
    return 'validation'
  }
  // 9. 部分降级（degraded 标记 / 发布部分成功）
  if (input.degraded === true ||
      (Array.isArray(input.failedPlatforms) && input.failedPlatforms.length > 0 && input.failedPlatforms.length < (input.totalPlatforms || input.failedPlatforms.length + 1))) {
    return 'partial_degradation'
  }
  return UNKNOWN
}

/**
 * 判定严重度：整线失败=blocker，阶段失败=major，部分降级=minor，其余=info
 */
function classifySeverity (input, failureType) {
  if (failureType === 'partial_degradation') return 'minor'
  if (input.runStatus === 'failed' || input.fatal === true) return 'blocker'
  if (input.degraded === true) return 'minor'
  if (failureType === UNKNOWN && input.runStatus !== 'completed') return UNKNOWN
  if (input.runStatus === 'completed' && failureType === UNKNOWN) return 'info'
  return 'major'
}

/**
 * 判定可恢复性
 */
function classifyRecoverability (failureType, input) {
  if (failureType === 'content_policy') return 'needs_user_input'
  if (failureType === 'validation') return 'permanent'
  if (input.hasCheckpoint === true) return 'checkpoint'
  if (failureType === 'timeout' || failureType === 'transient' || failureType === 'provider' ||
      failureType === 'infrastructure' || failureType === 'resource') return 'retryable'
  if (failureType === 'media' || failureType === 'partial_degradation') return 'degradable'
  return UNKNOWN
}

const EMPTY_CLASSIFICATION = Object.freeze({
  stage: UNKNOWN,
  failureType: UNKNOWN,
  severity: UNKNOWN,
  recoverability: UNKNOWN,
})

/**
 * 统一分类入口（纯函数，永不抛错）
 * @param {object|null|undefined} [input] - { stage, errorCode, code, message, error, degraded, failedPlatforms, totalPlatforms, hasCheckpoint, runStatus, fatal }
 * @returns {{ stage: string, failureType: string, severity: string, recoverability: string }}
 */
function classifyFailure (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...EMPTY_CLASSIFICATION }
  }
  try {
    const stage = normalizeStage(input.stage)
    const failureType = classifyFailureType(input)
    const severity = classifySeverity(input, failureType)
    const recoverability = classifyRecoverability(failureType, input)
    return { stage, failureType, severity, recoverability }
  } catch (_) {
    return { ...EMPTY_CLASSIFICATION }
  }
}

module.exports = {
  DIAG_STAGES,
  DIAG_FAILURE_TYPES,
  DIAG_SEVERITY,
  DIAG_RECOVERABILITY,
  classifyFailure,
  classifyFailureType,
  normalizeStage,
  UNKNOWN,
}

