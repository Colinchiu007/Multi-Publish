// @ts-check

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_SCHEDULE_DAYS = 30
const DEFAULT_MIN_ACCOUNT_INTERVAL_MS = 5 * 60 * 1000

/**
 * 将旧版单值账号选择和新版多选值统一为去重后的字符串数组。
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeAccountIds (value) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values
    .filter(id => typeof id === 'string')
    .map(id => id.trim())
    .filter(Boolean))]
}

/**
 * 构建后端发布目标。没有绑定账号时保留一个 null 目标，兼容旧账号流程。
 * @param {unknown} platforms
 * @param {Record<string, unknown>} selectedAccounts
 * @returns {{ platform: string, accountId: string | null }[]}
 */
export function buildPublishTargets (platforms, selectedAccounts) {
  if (!Array.isArray(platforms)) return []
  const accountMap = selectedAccounts && typeof selectedAccounts === 'object'
    ? selectedAccounts
    : {}
  return platforms
    .filter(platform => typeof platform === 'string' && platform.trim())
    .flatMap(platform => {
      const ids = normalizeAccountIds(accountMap[platform])
      return ids.length > 0
        ? ids.map(accountId => ({ platform, accountId }))
        : [{ platform, accountId: null }]
    })
}

/**
 * 校验定时发布条目。间隔按 platform + accountId 计算，避免不同账号互相阻塞。
 * @param {Array<{platform: string, accountId?: string | null, publishTime?: string | Date | null}>} entries
 * @param {{ now?: number, maxDays?: number, minIntervalMs?: number }} [options]
 * @returns {{ valid: boolean, message: string }}
 */
export function validateScheduleEntries (entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const maxDays = Number.isFinite(options.maxDays) ? options.maxDays : DEFAULT_MAX_SCHEDULE_DAYS
  const minIntervalMs = Number.isFinite(options.minIntervalMs)
    ? options.minIntervalMs
    : DEFAULT_MIN_ACCOUNT_INTERVAL_MS
  const groups = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.publishTime) continue
    const timestamp = new Date(entry.publishTime).getTime()
    if (!Number.isFinite(timestamp)) {
      return { valid: false, message: '定时发布时间无效' }
    }
    if (timestamp <= now) {
      return { valid: false, message: '定时发布时间必须晚于当前时间' }
    }
    if (timestamp > now + maxDays * DAY_MS) {
      return { valid: false, message: `定时发布时间不能超过 ${maxDays} 天` }
    }

    const platform = typeof entry.platform === 'string' ? entry.platform.trim() : ''
    if (!platform) return { valid: false, message: '定时任务缺少发布平台' }
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
        return {
          valid: false,
          message: `${list[index].platform} 账号 ${list[index].accountId === 'unbound' ? '' : list[index].accountId} 的定时任务间隔必须至少 5 分钟`.replace(/账号  的/, '任务的'),
        }
      }
    }
  }

  return { valid: true, message: '' }
}

export const PUBLISH_CONTRACT_LIMITS = Object.freeze({
  maxScheduleDays: DEFAULT_MAX_SCHEDULE_DAYS,
  minAccountIntervalMs: DEFAULT_MIN_ACCOUNT_INTERVAL_MS,
})
