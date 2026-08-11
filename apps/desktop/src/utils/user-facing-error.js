/**
 * 用户可见错误文案统一格式化（user-facing messages）
 *
 * 主进程 IPC 错误形态：{ code, errorCode, message, messageParams }。
 * 本模块把错误映射为当前语言下「具体原因 + 解决方法建议」的自然语言，
 * 未知错误不暴露原始技术文本（通道名 / 英文错误码 / 栈信息）。
 *
 * 解析顺序（严格）：
 *   1. input.errorCode（稳定机器码，优先）
 *   2. input.code（数值错误码，含 429/402）
 *   3. 遗留原始 message 的 pattern 匹配（兼容旧主进程返回）
 *   4. 调用方 fallback 或通用文案
 */
import { getAppLocale } from '../i18n'

export const USER_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  UNTRUSTED_SENDER: 'UNTRUSTED_SENDER',
  NOT_SIGNED_IN: 'NOT_SIGNED_IN',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  IO_ERROR: 'IO_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PROVIDER_EXISTS: 'PROVIDER_EXISTS',
  ADAPTER_NOT_FOUND: 'ADAPTER_NOT_FOUND',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  API_KEY_NOT_CONFIGURED: 'API_KEY_NOT_CONFIGURED',
  API_KEY_REQUIRED: 'API_KEY_REQUIRED',
  ADAPTER_INIT_FAILED: 'ADAPTER_INIT_FAILED',
  OPERATION_NOT_SUPPORTED: 'OPERATION_NOT_SUPPORTED',
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  SET_DEFAULT_FAILED: 'SET_DEFAULT_FAILED',
  ENCRYPT_FAILED: 'ENCRYPT_FAILED',
  CRYPTO_UNAVAILABLE: 'CRYPTO_UNAVAILABLE',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  STORE_NOT_INITIALIZED: 'STORE_NOT_INITIALIZED',
  NO_UPDATABLE_FIELDS: 'NO_UPDATABLE_FIELDS',
  OPERATION_FAILED: 'OPERATION_FAILED',
})

// 每条文案 = 「具体原因 + 解决方法建议」
const MESSAGES = Object.freeze({
  zh: Object.freeze({
    [USER_ERROR_CODES.AUTH_REQUIRED]: '当前未登录或登录状态已失效，无法使用该功能。请先登录后重试；若仍提示无权限，请确认当前账号已开通所需权益。',
    [USER_ERROR_CODES.ENTITLEMENT_REQUIRED]: '当前账号没有所需权益，无法使用该功能。请升级或开通对应权益后重试。',
    [USER_ERROR_CODES.UNTRUSTED_SENDER]: '检测到非预期的调用来源，本次操作已取消。请重启应用后重试。',
    [USER_ERROR_CODES.NOT_SIGNED_IN]: '当前未登录或登录已过期。请重新登录后重试。',
    [USER_ERROR_CODES.STORAGE_UNAVAILABLE]: '本地存储暂时不可用。请重启应用后重试；若持续出现，请检查本地磁盘空间与读写权限。',
    [USER_ERROR_CODES.NETWORK_ERROR]: '网络连接失败。请检查网络后重试。',
    [USER_ERROR_CODES.TIMEOUT]: '操作超时。请稍后重试；若持续出现请重启应用。',
    [USER_ERROR_CODES.VALIDATION_ERROR]: '提交的数据不符合要求。请检查输入后重试。',
    [USER_ERROR_CODES.NOT_FOUND]: '未找到相关记录或资源，可能已被删除。请刷新后重试。',
    [USER_ERROR_CODES.IO_ERROR]: '读写本地文件失败。请检查磁盘空间与文件权限后重试。',
    [USER_ERROR_CODES.RATE_LIMITED]: '操作过于频繁，已被服务商限流。请稍等片刻后再试。',
    [USER_ERROR_CODES.QUOTA_EXCEEDED]: '当前额度已用完。请等待额度恢复或升级套餐后重试。',
    [USER_ERROR_CODES.PROVIDER_EXISTS]: '该服务商 ID 已存在。请更换 ID，或直接编辑已有服务商后重试。',
    [USER_ERROR_CODES.ADAPTER_NOT_FOUND]: '未找到该服务商对应的适配器。请检查服务商配置后重试。',
    [USER_ERROR_CODES.PROVIDER_NOT_FOUND]: '未找到该服务商，可能已被删除。请刷新列表后重试。',
    [USER_ERROR_CODES.API_KEY_NOT_CONFIGURED]: '该服务商尚未配置 API Key。请在「模型设置」中填写对应服务商的 API Key 后重试。',
    [USER_ERROR_CODES.API_KEY_REQUIRED]: '远程服务商必须配置 API Key。请在「模型设置」中填写后重试。',
    [USER_ERROR_CODES.ADAPTER_INIT_FAILED]: '服务商初始化失败。请检查配置与服务商服务状态后重试。',
    [USER_ERROR_CODES.OPERATION_NOT_SUPPORTED]: '该服务商不支持此操作。请在「模型设置」中调整模型配置后重试。',
    [USER_ERROR_CODES.CREATE_FAILED]: '创建失败。请检查输入后重试。',
    [USER_ERROR_CODES.UPDATE_FAILED]: '更新失败。请稍后重试。',
    [USER_ERROR_CODES.DELETE_FAILED]: '删除失败。请稍后重试。',
    [USER_ERROR_CODES.SET_DEFAULT_FAILED]: '设置默认服务商失败。请稍后重试。',
    [USER_ERROR_CODES.ENCRYPT_FAILED]: 'API Key 加密失败。请重启应用后重试。',
    [USER_ERROR_CODES.CRYPTO_UNAVAILABLE]: '系统安全存储不可用，无法保存 API Key。请重启应用或检查系统设置后重试。',
    [USER_ERROR_CODES.INVALID_CATEGORY]: '选择的分类无效。请重新选择后重试。',
    [USER_ERROR_CODES.STORE_NOT_INITIALIZED]: '本地数据服务尚未就绪。请稍后重试或重启应用。',
    [USER_ERROR_CODES.NO_UPDATABLE_FIELDS]: '没有可更新的字段。请修改内容后再保存。',
    [USER_ERROR_CODES.OPERATION_FAILED]: '操作失败，请稍后重试。',
  }),
  en: Object.freeze({
    [USER_ERROR_CODES.AUTH_REQUIRED]: 'You are not signed in or your session has expired, so this feature is unavailable. Please sign in and try again; if it still says no permission, confirm the current account has the required plan.',
    [USER_ERROR_CODES.ENTITLEMENT_REQUIRED]: 'The current account does not have the required plan for this feature. Please upgrade or enable the corresponding plan and try again.',
    [USER_ERROR_CODES.UNTRUSTED_SENDER]: 'An unexpected call source was detected and the operation was cancelled. Please restart the app and try again.',
    [USER_ERROR_CODES.NOT_SIGNED_IN]: 'You are not signed in or your session has expired. Please sign in and try again.',
    [USER_ERROR_CODES.STORAGE_UNAVAILABLE]: 'Local storage is temporarily unavailable. Restart the app to retry; if it persists, check local disk space and read/write permissions.',
    [USER_ERROR_CODES.NETWORK_ERROR]: 'Network connection failed. Please check your network and try again.',
    [USER_ERROR_CODES.TIMEOUT]: 'The operation timed out. Please try again later; if it persists, restart the app.',
    [USER_ERROR_CODES.VALIDATION_ERROR]: 'The submitted data does not meet the requirements. Please check your input and try again.',
    [USER_ERROR_CODES.NOT_FOUND]: 'The related record or resource was not found and may have been deleted. Please refresh and try again.',
    [USER_ERROR_CODES.IO_ERROR]: 'Failed to read or write local files. Please check disk space and file permissions and try again.',
    [USER_ERROR_CODES.RATE_LIMITED]: 'You are being rate limited because of too many requests. Please wait a moment and try again.',
    [USER_ERROR_CODES.QUOTA_EXCEEDED]: 'Your current quota has been used up. Please wait for it to reset or upgrade your plan and try again.',
    [USER_ERROR_CODES.PROVIDER_EXISTS]: 'This provider ID already exists. Use a different ID, or edit the existing provider instead.',
    [USER_ERROR_CODES.ADAPTER_NOT_FOUND]: 'No adapter was found for this provider. Please check the provider configuration and try again.',
    [USER_ERROR_CODES.PROVIDER_NOT_FOUND]: 'The provider was not found and may have been deleted. Please refresh the list and try again.',
    [USER_ERROR_CODES.API_KEY_NOT_CONFIGURED]: 'This provider does not have an API key configured. Add the key in Model Settings and try again.',
    [USER_ERROR_CODES.API_KEY_REQUIRED]: 'Remote providers require an API key. Add it in Model Settings and try again.',
    [USER_ERROR_CODES.ADAPTER_INIT_FAILED]: 'Provider initialization failed. Please check the configuration and the provider service status, then try again.',
    [USER_ERROR_CODES.OPERATION_NOT_SUPPORTED]: 'This provider does not support this operation. Please adjust the model configuration in Model Settings and try again.',
    [USER_ERROR_CODES.CREATE_FAILED]: 'Creation failed. Please check your input and try again.',
    [USER_ERROR_CODES.UPDATE_FAILED]: 'Update failed. Please try again later.',
    [USER_ERROR_CODES.DELETE_FAILED]: 'Deletion failed. Please try again later.',
    [USER_ERROR_CODES.SET_DEFAULT_FAILED]: 'Failed to set the default provider. Please try again later.',
    [USER_ERROR_CODES.ENCRYPT_FAILED]: 'Failed to encrypt the API key. Please restart the app and try again.',
    [USER_ERROR_CODES.CRYPTO_UNAVAILABLE]: 'The system secure storage is unavailable, so the API key cannot be saved. Restart the app or check system settings and try again.',
    [USER_ERROR_CODES.INVALID_CATEGORY]: 'The selected category is invalid. Please select again and retry.',
    [USER_ERROR_CODES.STORE_NOT_INITIALIZED]: 'The local data service is not ready yet. Please try again later or restart the app.',
    [USER_ERROR_CODES.NO_UPDATABLE_FIELDS]: 'There are no updatable fields. Modify something before saving.',
    [USER_ERROR_CODES.OPERATION_FAILED]: 'The operation failed. Please try again later.',
  }),
})

// 数值错误码 → 稳定 errorCode（含 HTTP 语义码）
const NUMERIC_CODE_MAP = Object.freeze({
  429: USER_ERROR_CODES.RATE_LIMITED,
  402: USER_ERROR_CODES.QUOTA_EXCEEDED,
  '-3': USER_ERROR_CODES.AUTH_REQUIRED,
  '-2': USER_ERROR_CODES.VALIDATION_ERROR,
  '-10': USER_ERROR_CODES.NOT_FOUND,
  '-11': USER_ERROR_CODES.TIMEOUT,
  '-12': USER_ERROR_CODES.NETWORK_ERROR,
  '-13': USER_ERROR_CODES.IO_ERROR,
})

// 遗留原始 message pattern（兼容旧主进程返回，仅用于无法识别 errorCode/code 时）
const PATTERN_RULES = Object.freeze([
  {
    errorCode: USER_ERROR_CODES.AUTH_REQUIRED,
    patterns: [
      /当前许可证无权访问/i, /当前账号没有所需权益/i, /未登录|登录已过期|需要登录|请先登录/i,
      /not signed in|sign[ -]?in required|authentication required|access denied|not authorized|permission denied|unauthorized/i,
    ],
  },
  {
    errorCode: USER_ERROR_CODES.NETWORK_ERROR,
    patterns: [/网络连接|network error|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i],
  },
  {
    errorCode: USER_ERROR_CODES.TIMEOUT,
    patterns: [/超时|timeout|timed out|ETIMEDOUT/i],
  },
  {
    errorCode: USER_ERROR_CODES.STORAGE_UNAVAILABLE,
    patterns: [/存储不可用|存储不可写|storage (unavailable|not)|sqlite|database (error|unavailable)/i],
  },
  {
    errorCode: USER_ERROR_CODES.RATE_LIMITED,
    patterns: [/rate limit|too many requests|\b429\b|限流/i],
  },
  {
    errorCode: USER_ERROR_CODES.QUOTA_EXCEEDED,
    patterns: [/quota exceeded|\b402\b|额度|配额/i],
  },
  {
    errorCode: USER_ERROR_CODES.API_KEY_NOT_CONFIGURED,
    patterns: [/api key not configured|尚未配置 api key|未配置.*api.?key/i],
  },
  {
    errorCode: USER_ERROR_CODES.IO_ERROR,
    patterns: [/io error|读写.*失败|filesystem|ENOSPC|EACCES|EBUSY/i],
  },
])

function normalizeLocale (locale) {
  if (locale === 'en' || locale === 'zh') return locale
  return 'zh'
}

function defaultLocale () {
  try {
    return getAppLocale()
  } catch (_) {
    return 'zh'
  }
}

// 明显技术性文本特征（命中其一即视为内部文本，禁止直出）：
//   - 内部通道名 store:xxx / pipeline:xxx
//   - 大写下划线错误码 VOICE_CATALOG_UNAVAILABLE / ERR_xxx
//   - 栈信息（line N / at xxx）
//   - IP:端口
const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\b[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?::[a-z0-9-]+)*\b/i,
  /\b[A-Z]{2,}_[A-Z0-9_]+\b/,
  /\b(?:line|at)\s+\d+/i,
  /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/,
])

function looksTechnical (text) {
  return TECHNICAL_TEXT_PATTERNS.some((pattern) => pattern.test(text))
}

function toRawText (input) {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (input instanceof Error) return input.message || ''
  if (typeof input === 'object') {
    const value = input.message ?? input.error ?? input.reason
    if (typeof value === 'string') return value
    return String(value || '')
  }
  return String(input)
}

/**
 * 把 IPC 错误（或异常）格式化为当前语言的用户可见文案。
 * @param {*} input - { code, errorCode, message } | Error | string
 * @param {{ locale?: string, fallback?: string }} [options]
 * @returns {{ errorCode: string, message: string, matched: 'errorCode'|'code'|'pattern'|'fallback' }}
 */
export function formatUserError (input, options = {}) {
  const locale = normalizeLocale(options.locale || defaultLocale())
  const catalog = MESSAGES[locale]
  const rawText = toRawText(input)

  // 1. 稳定 errorCode（仅识别 catalog 中已知码，避免把内部码当文案）
  if (input && typeof input === 'object' && typeof input.errorCode === 'string') {
    const known = USER_ERROR_CODES[input.errorCode]
    const message = known ? catalog[input.errorCode] : null
    if (message) {
      return { errorCode: input.errorCode, message, matched: 'errorCode' }
    }
  }

  // 2. 数值错误码
  if (input && typeof input === 'object') {
    const numericKey = String(input.code)
    const mapped = NUMERIC_CODE_MAP[numericKey]
    if (mapped) {
      return { errorCode: mapped, message: catalog[mapped], matched: 'code' }
    }
  }

  // 3. 遗留 raw pattern
  if (rawText) {
    for (const rule of PATTERN_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(rawText))) {
        return { errorCode: rule.errorCode, message: catalog[rule.errorCode], matched: 'pattern' }
      }
    }
  }

  // 4. 未知错误：
  //    - 原始文本含明显技术标识（通道名 / 错误码 / 栈信息）→ 通用兜底，不泄露内部文本
  //    - 其余（已是自然语言的具体原因）→ 原样透传保留信息，仅在无文本时使用 fallback
  const fallbackMessage = typeof options.fallback === 'string' && options.fallback.trim()
    ? options.fallback
    : catalog[USER_ERROR_CODES.OPERATION_FAILED]
  if (rawText && looksTechnical(rawText)) {
    return { errorCode: USER_ERROR_CODES.OPERATION_FAILED, message: fallbackMessage, matched: 'fallback' }
  }
  const passThrough = rawText && rawText.length <= 200 ? rawText : fallbackMessage
  return { errorCode: USER_ERROR_CODES.OPERATION_FAILED, message: passThrough, matched: passThrough === rawText ? 'passthrough' : 'fallback' }
}
