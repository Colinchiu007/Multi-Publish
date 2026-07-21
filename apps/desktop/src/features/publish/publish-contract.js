// @ts-check

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_SCHEDULE_DAYS = 30
const DEFAULT_MIN_ACCOUNT_INTERVAL_MS = 5 * 60 * 1000

const PLATFORM_LABELS = Object.freeze({
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  tencent_video: '视频号',
  kuaishou: '快手',
  toutiao: '今日头条',
  bilibili: '哔哩哔哩',
  baijiahao: '百家号',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  facebook: 'Facebook',
})

const PLATFORM_CONTENT_LIMITS = Object.freeze({
  weibo: { titleMax: 0, contentMax: 2000 },
  wechat_mp: { titleMax: 64, contentMax: 20000 },
  zhihu: { titleMax: 50, contentMax: 100000 },
  douyin: { titleMax: 55, contentMax: 0 },
  bilibili: { titleMax: 80, contentMax: 2000 },
  xiaohongshu: { titleMax: 20, contentMax: 1000 },
  toutiao: { titleMax: 30, contentMax: 100000 },
  youtube: { titleMax: 100, contentMax: 5000 },
  tiktok: { titleMax: 2200, contentMax: 0 },
  twitter: { titleMax: 0, contentMax: 280 },
  instagram: { titleMax: 0, contentMax: 2200 },
})

const DEFAULT_CONTENT_LIMITS = Object.freeze({ titleMax: 100, contentMax: 5000 })

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
 * 返回平台展示名称，避免页面各自维护一份中文映射。
 * @param {unknown} platformId
 * @returns {string}
 */
export function getPlatformLabel (platformId) {
  return PLATFORM_LABELS[platformId] || String(platformId || '')
}

/**
 * 返回平台标题/正文限制的副本，调用方不能修改全局契约。
 * @param {unknown} platformId
 * @returns {{ titleMax: number, contentMax: number }}
 */
export function getPlatformContentLimit (platformId) {
  const limit = PLATFORM_CONTENT_LIMITS[platformId] || DEFAULT_CONTENT_LIMITS
  return { titleMax: limit.titleMax, contentMax: limit.contentMax }
}

/**
 * 发布前要求每个目标都绑定真实账号。旧版 null 目标仍由
 * buildPublishTargets 保留，以便迁移旧草稿，但不能进入新发布 IPC。
 * @param {unknown} targets
 * @returns {{ valid: boolean, platform?: string, message?: string }}
 */
export function validatePublishTargets (targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { valid: false, message: '请至少选择一个发布账号' }
  }

  for (const target of targets) {
    const platform = typeof target?.platform === 'string' ? target.platform.trim() : ''
    if (!platform) return { valid: false, message: '发布目标缺少平台' }
    const accountId = typeof target?.accountId === 'string' ? target.accountId.trim() : ''
    if (!accountId) {
      return {
        valid: false,
        platform,
        message: `请为${getPlatformLabel(platform)}选择至少一个账号`,
      }
    }
  }

  return { valid: true }
}

/**
 * 按平台校验默认文章或差异化文章内容。
 * @param {{ platforms?: unknown, article?: Record<string, unknown>, platformOverrides?: Record<string, unknown> }} options
 * @returns {{ valid: boolean, platform?: string, field?: string, limit?: number, actual?: number, message?: string }}
 */
export function validatePlatformContent ({ platforms, article = {}, platformOverrides = {} } = {}) {
  const uniquePlatforms = [...new Set(Array.isArray(platforms) ? platforms : [])]
  for (const platform of uniquePlatforms) {
    if (typeof platform !== 'string' || !platform.trim()) continue
    const limit = getPlatformContentLimit(platform)
    const override = platformOverrides && typeof platformOverrides[platform] === 'object'
      ? platformOverrides[platform]
      : {}
    const title = String(override.title || article.title || '')
    const content = String(override.content || article.content || '')
    const fields = [
      ['title', title, limit.titleMax, '标题'],
      ['content', content, limit.contentMax, '正文'],
    ]
    for (const [field, value, max, label] of fields) {
      if (max > 0 && Array.from(value).length > max) {
        const actual = Array.from(value).length
        return {
          valid: false,
          platform,
          field,
          limit: max,
          actual,
          message: `${getPlatformLabel(platform)}${label}最多 ${max} 个字符，当前 ${actual} 个`,
        }
      }
    }
  }
  return { valid: true }
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
