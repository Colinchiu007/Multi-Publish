// @ts-check
/**
 * message-contract.js — 通知/错误文案统一契约层（renderer 侧纯函数核心）
 *
 * 职责（对应 01-docs/ARCH-notify-log-standard.md §3.2）：
 *   1. MESSAGE_KEYS — 稳定 messageKey 枚举（引用既有命名空间，不重命名）
 *   2. ERROR_NORMALIZE_RULES — 共享错误归一化规则表（语义重叠模式收敛为单一规范正则）
 *   3. ERROR_CATEGORY — 跨模块关联键（同一语义错误跨命名空间映射到同一 errorCategory）
 *   4. NOTIFY_LEVELS / NOTIFY_LEVEL_MAP — level 白名单与 logger 级别映射
 *   5. TECHNICAL_TEXT_PATTERNS — 技术文本特征检测（用户文案插值前拦截）
 *
 * 本模块为纯函数，不依赖 Vue / i18n 实例，供 notifyCore / 各 formatter 复用。
 */
import { USER_ERROR_CODES } from './user-facing-error'
import { STORY2VIDEO_NOTIFICATION_KEYS } from '@/story2video/story2video-notifications'

/**
 * 稳定 messageKey 枚举。
 * 引用既有命名空间（userErrors.* / story2video.*），不重命名既有 key；
 * 新增通用域（publish.* / account.* / collection.* / batch.*）渐进补充。
 */
export const MESSAGE_KEYS = Object.freeze({
  // 通用域（新增）
  OPERATION_FAILED: 'operation_failed',
  UNCAUGHT_RENDERER_ERROR: 'renderer.uncaught_error',
  // 引用既有命名空间（保留，避免破坏性改动）
  userErrors: USER_ERROR_CODES,
  story2video: STORY2VIDEO_NOTIFICATION_KEYS,
})

/**
 * 跨模块关联键：同一语义错误在不同命名空间的多个 messageKey → 同一 errorCategory。
 * errorCategory 是稳定机器码，独立于文案 key，用于跨模块日志检索（M1 修复）。
 */
export const ERROR_CATEGORY = Object.freeze({
  AUTH_REQUIRED: 'auth_required',
  ENTITLEMENT_REQUIRED: 'entitlement_required',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',
  COMPOSE_TIMEOUT: 'compose_timeout',
  COMPOSE_DURATION_EXCEEDED: 'compose_duration_exceeded',
  NEEDS_USER_INPUT: 'needs_user_input',
  EMPTY_RESULT: 'empty_result',
  STORAGE_UNAVAILABLE: 'storage_unavailable',
  IO_ERROR: 'io_error',
  VALIDATION_ERROR: 'validation_error',
  NOT_FOUND: 'not_found',
  API_KEY_NOT_CONFIGURED: 'api_key_not_configured',
  API_KEY_INVALID: 'api_key_invalid',
  PROVIDER_PARAMS_UNSUPPORTED: 'provider_params_unsupported',
  ASSET_GENERATION_FAILED: 'asset_generation_failed',
  OPTIMIZE_FAILED: 'optimize_failed',
  COMPOSE_FAILED: 'compose_failed',
  API_ERROR: 'api_error',
  OPERATION_FAILED: 'operation_failed',
  UNKNOWN: 'unknown',
})

/**
 * messageKey → errorCategory 映射。
 * 同一语义错误跨命名空间（userErrors.* / story2video.*）映射到同一 errorCategory。
 */
const MESSAGE_KEY_CATEGORY_MAP = Object.freeze({
  // userErrors.*
  [USER_ERROR_CODES.AUTH_REQUIRED]: ERROR_CATEGORY.AUTH_REQUIRED,
  [USER_ERROR_CODES.ENTITLEMENT_REQUIRED]: ERROR_CATEGORY.ENTITLEMENT_REQUIRED,
  [USER_ERROR_CODES.NETWORK_ERROR]: ERROR_CATEGORY.NETWORK_ERROR,
  [USER_ERROR_CODES.TIMEOUT]: ERROR_CATEGORY.TIMEOUT,
  [USER_ERROR_CODES.RATE_LIMITED]: ERROR_CATEGORY.RATE_LIMITED,
  [USER_ERROR_CODES.QUOTA_EXCEEDED]: ERROR_CATEGORY.QUOTA_EXCEEDED,
  [USER_ERROR_CODES.STORAGE_UNAVAILABLE]: ERROR_CATEGORY.STORAGE_UNAVAILABLE,
  [USER_ERROR_CODES.IO_ERROR]: ERROR_CATEGORY.IO_ERROR,
  [USER_ERROR_CODES.VALIDATION_ERROR]: ERROR_CATEGORY.VALIDATION_ERROR,
  [USER_ERROR_CODES.NOT_FOUND]: ERROR_CATEGORY.NOT_FOUND,
  [USER_ERROR_CODES.API_KEY_NOT_CONFIGURED]: ERROR_CATEGORY.API_KEY_NOT_CONFIGURED,
  [USER_ERROR_CODES.OPERATION_FAILED]: ERROR_CATEGORY.OPERATION_FAILED,
  // story2video.*
  [STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED]: ERROR_CATEGORY.RATE_LIMITED,
  [STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED]: ERROR_CATEGORY.QUOTA_EXCEEDED,
  [STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_TIMEOUT]: ERROR_CATEGORY.COMPOSE_TIMEOUT,
  [STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_DURATION_EXCEEDED]: ERROR_CATEGORY.COMPOSE_DURATION_EXCEEDED,
  [STORY2VIDEO_NOTIFICATION_KEYS.NEEDS_USER_INPUT]: ERROR_CATEGORY.NEEDS_USER_INPUT,
  [STORY2VIDEO_NOTIFICATION_KEYS.EMPTY_RESULT]: ERROR_CATEGORY.EMPTY_RESULT,
  [STORY2VIDEO_NOTIFICATION_KEYS.API_KEY_INVALID]: ERROR_CATEGORY.API_KEY_INVALID,
  [STORY2VIDEO_NOTIFICATION_KEYS.PROVIDER_PARAMS_UNSUPPORTED]: ERROR_CATEGORY.PROVIDER_PARAMS_UNSUPPORTED,
  [STORY2VIDEO_NOTIFICATION_KEYS.ASSET_GENERATION_FAILED]: ERROR_CATEGORY.ASSET_GENERATION_FAILED,
  [STORY2VIDEO_NOTIFICATION_KEYS.OPTIMIZE_FAILED]: ERROR_CATEGORY.OPTIMIZE_FAILED,
  [STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_FAILED]: ERROR_CATEGORY.COMPOSE_FAILED,
  [STORY2VIDEO_NOTIFICATION_KEYS.API_ERROR]: ERROR_CATEGORY.API_ERROR,
  [STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED]: ERROR_CATEGORY.OPERATION_FAILED,
})

/**
 * 解析 messageKey → errorCategory。
 * 同时支持裸 errorCode（'AUTH_REQUIRED'）与带命名空间前缀（'userErrors.AUTH_REQUIRED'）。
 * @param {string} messageKey
 * @returns {string} errorCategory（未知 key → ERROR_CATEGORY.UNKNOWN）
 */
export function resolveErrorCategory (messageKey) {
  if (!messageKey) return ERROR_CATEGORY.UNKNOWN
  if (MESSAGE_KEY_CATEGORY_MAP[messageKey]) return MESSAGE_KEY_CATEGORY_MAP[messageKey]
  // 带命名空间前缀：取末段（如 'userErrors.AUTH_REQUIRED' → 'AUTH_REQUIRED'）
  const lastSegment = String(messageKey).split('.').pop()
  if (lastSegment && MESSAGE_KEY_CATEGORY_MAP[lastSegment]) {
    return MESSAGE_KEY_CATEGORY_MAP[lastSegment]
  }
  return ERROR_CATEGORY.UNKNOWN
}

/**
 * 共享错误归一化规则表。
 * 语义重叠模式（quota_exceeded / rate_limited / compose_timeout / compose_duration_exceeded / needs_user_input）
 * 收敛为单一规范正则（C1 修复：真收敛，接受行为变更 + 逐模式回归断言）。
 *
 * 每条：{ errorCategory, patterns[], key, extract? }
 *   errorCategory — 跨模块关联键
 *   key          — locale 键（相对命名空间，如 'quota_exceeded'）
 *   extract      — 可选函数(raw) → params 提取模板变量
 */
export const ERROR_NORMALIZE_RULES = Object.freeze([
  // 402 余额不足 / 用量窗口耗尽
  {
    errorCategory: ERROR_CATEGORY.QUOTA_EXCEEDED,
    key: 'quota_exceeded',
    patterns: [
      /insufficient_balance_error|Error code:\s*402|error.*402.*insufficient/i,
      /GoUsageLimitError|usage\s+limit\s+(?:has\s+been\s+)?(?:reached|exhausted|exceeded)/i,
      /quota exceeded|\b402\b|额度|配额/i,
    ],
  },
  // 频率/配额限制（429）
  {
    errorCategory: ERROR_CATEGORY.RATE_LIMITED,
    key: 'rate_limited',
    patterns: [
      /rate.?limit|too many requests|429|限流|频率.*限制|Error\s+code:\s*429|rpm\s+exhausted|429\s+Too\s+Many/i,
    ],
  },
  // 视频合成超时
  {
    errorCategory: ERROR_CATEGORY.COMPOSE_TIMEOUT,
    key: 'compose_timeout',
    patterns: [
      /compose.*timeout|视频合成超时|视频合成.*超时|composit.*timed?\s*out/i,
    ],
  },
  // 视频时长超限
  {
    errorCategory: ERROR_CATEGORY.COMPOSE_DURATION_EXCEEDED,
    key: 'compose_duration_exceeded',
    patterns: [
      /超过.*分钟上限|视频.*时长.*超|exceeds?\s+the\s+\d+.*minute/i,
    ],
  },
  // 内容政策 / 需要用户输入
  {
    errorCategory: ERROR_CATEGORY.NEEDS_USER_INPUT,
    key: 'needs_user_input',
    patterns: [
      /needs_user_input|content[_ -]?policy.*review|需要.*修改文案|内容政策.*需要(?:用户)?输入/i,
    ],
  },
])

/**
 * 在共享规则表中匹配 rawError，返回首个命中规则。
 * @param {string} rawError
 * @returns {{ errorCategory: string, key: string, pattern: RegExp } | null}
 */
export function matchNormalizeRule (rawError) {
  const raw = String(rawError || '')
  if (!raw) return null
  for (const rule of ERROR_NORMALIZE_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(raw)) {
        return { errorCategory: rule.errorCategory, key: rule.key, pattern }
      }
    }
  }
  return null
}

/**
 * level 白名单（C2 修复：主进程只接受 {info, warn, error}）。
 * 渲染端 level 语义更丰富（success/confirm），但落日志前映射到白名单三档。
 */
export const NOTIFY_LEVELS = Object.freeze(['info', 'warn', 'error'])

/**
 * 渲染端 level → 日志级别映射表（M9 修复）。
 * success/info → INFO；warning → WARN；error → ERROR；confirm → 可选 INFO 或不记。
 */
export const NOTIFY_LEVEL_MAP = Object.freeze({
  success: 'info',
  info: 'info',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
  confirm: 'info',
})

/**
 * 校验 level 是否在白名单内。
 * @param {string} level
 * @returns {boolean}
 */
export function isAllowedNotifyLevel (level) {
  return NOTIFY_LEVELS.includes(level)
}

/**
 * 明显技术性文本特征（命中其一即视为内部文本，禁止直出用户文案）：
 *   - 内部通道名 store:xxx / pipeline:xxx
 *   - 大写下划线错误码 VOICE_CATALOG_UNAVAILABLE / ERR_xxx
 *   - 栈信息（line N / at xxx）
 *   - IP:端口
 * 复用 user-facing-error.js 的 TECHNICAL_TEXT_PATTERNS 语义（M4 修复：追加 IP:端口）。
 */
export const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\b[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?::[a-z0-9-]+)*\b/i,
  /\b[A-Z]{2,}_[A-Z0-9_]+\b/,
  /\b(?:line|at)\s+\d+/i,
  /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/,
])

/**
 * 判断文本是否含技术特征。
 * @param {string} text
 * @returns {boolean}
 */
export function looksTechnical (text) {
  return TECHNICAL_TEXT_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * 校验 messageKey 是否已知（契约层 key 集合）。
 * 用于主进程 notify:log 服务端白名单（C2 修复）。
 * @param {string} messageKey
 * @returns {boolean}
 */
export function isKnownMessageKey (messageKey) {
  if (!messageKey) return false
  if (messageKey === MESSAGE_KEYS.OPERATION_FAILED || messageKey === MESSAGE_KEYS.UNCAUGHT_RENDERER_ERROR) return true
  if (Object.values(USER_ERROR_CODES).includes(messageKey)) return true
  if (Object.values(STORY2VIDEO_NOTIFICATION_KEYS).includes(messageKey)) return true
  return false
}