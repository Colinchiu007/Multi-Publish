// @ts-check
/**
 * notifyCore.js — 通知/日志上报纯函数核心（renderer 侧）
 *
 * 职责（对应 01-docs/ARCH-notify-log-standard.md §3.3）：
 *   1. 从 locales 解析 messageKey → 当前语言文案（复用 localeMessageSource 思路）
 *   2. 通过 electron-bridge 调用 notify:log 上报结构化日志（fire-and-forget，不阻塞 UI）
 *   3. level 映射（NOTIFY_LEVEL_MAP：success/info→info，warning→warn，error→error）
 *   4. errorCategory 关联（M1 修复：跨模块日志检索）
 *
 * 本模块为纯函数，不依赖 Vue；useNotify 是薄封装负责 ElMessage 展示。
 */
import { getAppLocale } from '@/i18n'
import zhLocale from '@/locales/zh'
import enLocale from '@/locales/en'
import { invoke } from '@/api/electron-bridge'
import { NOTIFY_LEVEL_MAP, resolveErrorCategory } from '@/utils/message-contract'

const LOCALE_TREES = Object.freeze({ zh: zhLocale, en: enLocale })

function normalizeLocale (locale) {
  return locale === 'en' ? 'en' : 'zh'
}

function defaultLocale () {
  try {
    return getAppLocale()
  } catch (_) {
    return 'zh'
  }
}

/** 从 locales 树按点分路径取文案叶子（string 或 message function）。 */
function localeMessageSource (locale, key) {
  const tree = LOCALE_TREES[normalizeLocale(locale)] || LOCALE_TREES.zh
  const leaf = String(key || '').split('.').reduce(
    (acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined),
    tree,
  )
  if (typeof leaf === 'string' || typeof leaf === 'function') return leaf
  return undefined
}

/**
 * 模板插值：
 *  - message function 叶子（(ctx) => '...' + ctx.named('x') + '...'）→ 构造 ctx 调用
 *  - 字符串叶子（含 {name} 占位符）→ 正则替换（与 story2video-notifications 对齐）
 */
function interpolateMessage (template, params) {
  if (typeof template === 'function') {
    return template({ named: (name) => {
      const value = params && params[name]
      return value == null ? '' : String(value)
    } })
  }
  return String(template || '').replace(/\{([^{}]+)\}/g, (_placeholder, name) => {
    const value = params && params[name]
    return value == null ? '' : String(value)
  })
}

/**
 * 解析 messageKey → 当前语言文案。
 * @param {string} messageKey - 如 'story2video.quota_exceeded' / 'operation_failed'
 * @param {object} [params] - 插值参数
 * @param {string} [locale]
 * @returns {{ text: string, resolved: boolean }} resolved=false 表示 key 未命中（调用方需兜底）
 */
export function resolveNotifyText (messageKey, params, locale) {
  const normalized = normalizeLocale(locale || defaultLocale())
  const template = localeMessageSource(normalized, messageKey)
  if (!template) return { text: '', resolved: false }
  return { text: interpolateMessage(template, params), resolved: true }
}

/**
 * 通过 notify:log 上报结构化日志（fire-and-forget）。
 * 失败静默（日志上报不得影响主流程）。
 * @param {string} messageKey
 * @param {object} [options]
 * @param {string} [options.module]
 * @param {'success'|'info'|'warning'|'warn'|'error'|'confirm'} [options.level]
 * @param {object} [options.params] - 仅标量（string/number/boolean），主进程会二次校验
 * @param {string} [options.errorCategory] - 显式覆盖；缺省用 resolveErrorCategory(messageKey)
 * @param {string} [options.error] - 原始错误文本（脱敏后落日志）
 */
export function reportNotify (messageKey, options = {}) {
  const level = NOTIFY_LEVEL_MAP[options.level] || 'info'
  const payload = {
    messageKey,
    module: options.module || 'renderer',
    level,
    params: options.params && typeof options.params === 'object' ? options.params : {},
    errorCategory: options.errorCategory || resolveErrorCategory(messageKey),
    error: options.error,
  }
  try {
    // fire-and-forget：不 await，日志失败静默
    invoke('notifyLog', payload).catch(() => {})
  } catch (_) {
    // 无 electronAPI 或调用异常时静默降级
  }
}

/**
 * 便捷：解析文案 + 上报日志一步完成。
 * @param {string} messageKey
 * @param {object} [options]
 * @param {object} [options.params]
 * @param {string} [options.module]
 * @param {'success'|'info'|'warning'|'warn'|'error'|'confirm'} [options.level]
 * @returns {string} 解析后的文案（未命中返回 ''，调用方兜底）
 */
export function notifyText (messageKey, options = {}) {
  const { text, resolved } = resolveNotifyText(messageKey, options.params)
  if (resolved) {
    reportNotify(messageKey, options)
  }
  return text
}