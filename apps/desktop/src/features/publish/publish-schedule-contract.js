/**
 * 定时发布校验契约（从 publish-contract.js 拆出，逐文件行数门禁）。
 *
 * 拆分理由：publish-contract.js 同时承担「内容归一化 + 平台限制 + 定时校验」
 * 三类职责，行数已逼近门禁阈值。定时校验自成一体（输入是带 publishTime 的
 * 发布条目、输出是结构化校验结果），单独成文件更清晰，也便于单独测试。
 *
 * 关键设计：校验结果同时返回**结构化** `reason`/`params` 与**已本地化**的
 * `message`。调用方注入 `translate` 时走 locales（en-US 用户不该看到中文）；
 * 未注入时经 i18n 全局实例兜底查表，查不到则返回空串由调用方决定呈现方式。
 * 早期实现把 5 条提示写成中文模板字符串硬编码在业务文件里，既让英文用户看到
 * 中文，又会被 CI locale 基线扫描判为「渲染端新增硬编码中文」。
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** 定时发布可排期上限：未来 30 天 */
export const DEFAULT_MAX_SCHEDULE_DAYS = 30
/** 同一平台同一账号两次定时发布的最小间隔：5 分钟 */
export const DEFAULT_MIN_ACCOUNT_INTERVAL_MS = 5 * 60 * 1000

/**
 * 默认兜底翻译器：走 i18n 全局实例查 zh/en 词条。
 * 该模块拿不到 useI18n()（同步 API，动态 import 不可用），故用启动时挂载的全局实例。
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
function defaultScheduleMessage (key, params = {}) {
  try {
    const i18n = globalThis.__MP_I18N__
    if (i18n && typeof i18n.global !== 'undefined' && typeof i18n.global.t === 'function') {
      const fullKey = `publishPage.scheduleValidation.${key}`
      const resolved = i18n.global.t(fullKey, params)
      if (typeof resolved === 'string' && resolved && resolved !== fullKey) return resolved
    }
  } catch { /* 查表失败退回无文案 */ }
  // i18n 不可用（纯逻辑单测 / CLI）：返回空串，由调用方决定如何呈现
  return ''
}

/**
 * 校验定时发布条目。间隔按 platform + accountId 计算，避免不同账号互相阻塞。
 * @param {Array<{platform: string, accountId?: string | null, publishTime?: string | Date | null}>} entries
 * @param {{ now?: number, maxDays?: number, minIntervalMs?: number, translate?: (key: string, params?: Record<string, unknown>) => string }} [options]
 * @returns {{ valid: boolean, message: string, reason?: string, params?: Record<string, unknown> }}
 */
export function validateScheduleEntries (entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const maxDays = Number.isFinite(options.maxDays) ? options.maxDays : DEFAULT_MAX_SCHEDULE_DAYS
  const minIntervalMs = Number.isFinite(options.minIntervalMs)
    ? options.minIntervalMs
    : DEFAULT_MIN_ACCOUNT_INTERVAL_MS
  const translate = typeof options.translate === 'function'
    ? options.translate
    : defaultScheduleMessage
  const groups = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.publishTime) continue
    const timestamp = new Date(entry.publishTime).getTime()
    if (!Number.isFinite(timestamp)) {
      return { valid: false, reason: 'scheduleInvalidTime', params: {}, message: translate('scheduleInvalidTime') }
    }
    if (timestamp <= now) {
      return { valid: false, reason: 'scheduleMustBeFuture', params: {}, message: translate('scheduleMustBeFuture') }
    }
    if (timestamp > now + maxDays * DAY_MS) {
      const params = { maxDays }
      return { valid: false, reason: 'scheduleExceedsMaxDays', params, message: translate('scheduleExceedsMaxDays', params) }
    }

    const platform = typeof entry.platform === 'string' ? entry.platform.trim() : ''
    if (!platform) {
      return { valid: false, reason: 'scheduleMissingPlatform', params: {}, message: translate('scheduleMissingPlatform') }
    }
    const accountId = typeof entry.accountId === 'string' && entry.accountId.trim()
      ? entry.accountId.trim()
      : 'unbound'
    const key = `${platform}:${accountId}`
    const list = groups.get(key) || []
    list.push({ timestamp, platform, accountId })
    groups.set(key, list)
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
    for (let index = 1; index < list.length; index += 1) {
      if (list[index].timestamp - list[index - 1].timestamp < minIntervalMs) {
        const params = {
          platform: list[index].platform,
          accountId: list[index].accountId === 'unbound' ? '' : list[index].accountId,
          minMinutes: Math.round(minIntervalMs / 60000)
        }
        return {
          valid: false,
          reason: 'scheduleIntervalTooShort',
          params,
          message: translate('scheduleIntervalTooShort', params)
        }
      }
    }
  }

  return { valid: true, message: '' }
}

/**
 * 定时发布的限制常量（UI hint 与校验共用同一真源，避免文案与实际校验漂移）。
 */
export const PUBLISH_CONTRACT_LIMITS = Object.freeze({
  maxScheduleDays: DEFAULT_MAX_SCHEDULE_DAYS,
  minAccountIntervalMs: DEFAULT_MIN_ACCOUNT_INTERVAL_MS,
})