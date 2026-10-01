// @ts-check

// 发布能力注册表（openspec/changes/publish-capability-registry）：
// 平台内容限制与无标题平台清单的单一真源在 shared-utils。
// 渲染进程经 Vite alias 消费 publish-capabilities.browser.js（ESM），
// vitest 经 node_modules 解析 CJS 版——两版本导出同名同构（parity 测试锁定）。
import {
  composeNoTitleDescription,
  getPlatformContentLimit as getRegistryContentLimit,
  isNoTitlePlatform,
} from '@multi-publish/shared-utils/src/publish-capabilities'

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
 * 将标签/话题等用户输入统一为纯字符串数组。
 * 兼容旧草稿中的逗号分隔字符串和 { name } 对象，不把原始响应式对象
 * 传入 Electron IPC。
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePublishStringList (value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，、]/)
      : []
  return [...new Set(values.map(item => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object' && typeof item.name === 'string') return item.name.trim()
    return ''
  }).filter(Boolean))]
}

function normalizeFileReference (value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const candidates = [value.path, value.filePath, value.file_path, value.url, value.src, value.name]
  return candidates.find(candidate => typeof candidate === 'string' && candidate.trim())?.trim() || ''
}

/**
 * 将本地文件或 URL 转为可结构化克隆的描述对象。
 * @param {unknown} value
 * @returns {{ path: string, name: string, type?: string, size?: number, lastModified?: number } | null}
 */
export function normalizePublishFile (value) {
  const path = normalizeFileReference(value)
  if (!path) return null
  const source = value && typeof value === 'object' ? value : {}
  const file = {
    path,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : path,
  }
  if (typeof source.type === 'string' && source.type.trim()) file.type = source.type.trim()
  if (Number.isFinite(source.size) && source.size >= 0) file.size = source.size
  if (Number.isFinite(source.lastModified) && source.lastModified >= 0) file.lastModified = source.lastModified
  return file
}

/**
 * 将图片/文件输入统一为文件描述数组。
 * @param {unknown} value
 * @returns {{ path: string, name: string, type?: string, size?: number, lastModified?: number }[]}
 */
export function normalizePublishFiles (value) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  const files = values.map(normalizePublishFile).filter(Boolean)
  const seen = new Set()
  return files.filter(file => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

/**
 * 将 @ 提及统一为后端已使用的 { name, text } 结构。
 * @param {unknown} value
 * @returns {{ name: string, text: string }[]}
 */
export function normalizePublishMentions (value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，、]/)
      : []
  const mentions = []
  const seen = new Set()
  for (const item of values) {
    const source = typeof item === 'string' ? { name: item } : item
    if (!source || typeof source !== 'object') continue
    const rawName = typeof source.name === 'string'
      ? source.name
      : typeof source.username === 'string'
        ? source.username
        : typeof source.handle === 'string'
          ? source.handle
          : ''
    const name = rawName.trim().replace(/^@+/, '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    mentions.push({ name, text: `@${name}` })
  }
  return mentions
}

/**
 * 校验图文扩展字段的形状。所有字段均为可选，避免把尚未被后端声明的
 * 能力变成新的必填 API；但一旦传入，必须是可结构化克隆的纯值。
 * @param {Record<string, unknown>} article
 * @returns {{ valid: boolean, field?: string, message?: string }}
 */
export function validatePublishMetadata (article = {}) {
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    return { valid: false, field: 'article', message: '发布内容格式无效' }
  }

  const listFields = [
    ['tags', normalizePublishStringList],
    ['topics', normalizePublishStringList],
    ['mentions', normalizePublishMentions],
  ]
  for (const [field, normalize] of listFields) {
    if (article[field] === undefined || article[field] === null || typeof article[field] === 'string' || Array.isArray(article[field])) {
      const values = Array.isArray(article[field])
        ? article[field]
        : typeof article[field] === 'string'
          ? article[field].split(/[\n,，、]/)
          : []
      const validValues = values.every(value => {
        if (typeof value === 'string') return true
        if (!value || typeof value !== 'object') return false
        if (field === 'mentions') {
          return ['name', 'username', 'handle'].some(key => typeof value[key] === 'string')
        }
        return typeof value.name === 'string'
      })
      if (!validValues) return { valid: false, field, message: `${field} 字段格式无效` }
      const normalized = normalize(article[field])
      if (normalized.some(item => typeof item !== 'string' && (!item || typeof item !== 'object'))) {
        return { valid: false, field, message: `${field} 字段格式无效` }
      }
      continue
    }
    return { valid: false, field, message: `${field} 字段格式无效` }
  }

  const fileFields = [
    ['images', normalizePublishFiles],
    ['image_files', normalizePublishFiles],
  ]
  for (const [field, normalize] of fileFields) {
    if (article[field] === undefined || article[field] === null) continue
    if (!Array.isArray(article[field]) && typeof article[field] !== 'string' && typeof article[field] !== 'object') {
      return { valid: false, field, message: `${field} 字段格式无效` }
    }
    const values = Array.isArray(article[field]) ? article[field] : [article[field]]
    if (values.some(value => {
      if (typeof value === 'string') return !value.trim()
      return !value || typeof value !== 'object' || normalize(value).length === 0
    })) {
      return { valid: false, field, message: `${field} 文件引用无效` }
    }
  }

  for (const field of ['cover_file', 'cover_path']) {
    if (article[field] === undefined || article[field] === null || article[field] === '') continue
    if (!normalizeFileReference(article[field])) {
      return { valid: false, field, message: '封面文件引用无效' }
    }
  }

  return { valid: true }
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
 * 数据源：发布能力注册表（shared-utils publish-capabilities，单一真源）。
 * 百家号标题按 UTF-8 字节数校验（后端 Math.floor(utf8Bytes/3) > 49 拒绝，
 * 即 utf8Bytes >= 150 拒绝），安全上限 149 字节。实测 50 个中文字符（150 字节）
 * 被拒，50 字符混合（140 字节）与 49 中文+1 英文（148 字节）成功。
 * @param {unknown} platformId
 * @returns {{ titleMax?: number, titleMaxBytes?: number, contentMax: number }}
 */
export function getPlatformContentLimit (platformId) {
  return getRegistryContentLimit(platformId)
}

/**
 * 按 Unicode 码点截断字符串到 max 个字符，避免把代理对（emoji 等）切成半个字符。
 * 用于一键发布时对超长标题/正文自动截断，保证不因平台字数限制阻断发布。
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
export function truncateByChars (value, max) {
  const text = String(value ?? '').trim()
  const chars = Array.from(text)
  return max > 0 && chars.length > max ? chars.slice(0, max).join('') : text
}

/**
 * 按平台上限裁剪正文（2026-10-01 新增，供发布流程在正文超长时自动裁剪）。
 *
 * **必须与 validatePlatformContent 同源**：复用 getPlatformContentLimit 与
 * isNoTitlePlatform，禁止在此另写一份"标题合并进正文"的口径 —— 否则会出现
 * "裁剪后校验仍不过"的漂移。E2E 实测踩到过：正文裁到 997 字后，快手因
 * **标题计入首行**（composeNoTitleDescription）仍报 1021 > 1000。
 *
 * @param {unknown} platform 平台标识
 * @param {unknown} content 正文
 * @param {unknown} title 标题（无标题平台会作为描述首行插入，需从预算中扣除）
 * @returns {string} 裁剪后的正文（未超限时原样返回）
 */
export function truncateContentForPlatform (platform, content, title) {
  const limit = getPlatformContentLimit(platform)
  const max = Number(limit && limit.contentMax)
  if (!(max > 0)) return String(content ?? '')
  const titleLen = isNoTitlePlatform(platform) ? Array.from(String(title ?? '')).length : 0
  return truncateByChars(content, Math.max(0, max - titleLen))
}

/**
 * 计算一组平台下正文可用的**最小**预算（2026-10-01 新增）。
 *
 * 为什么需要它：若按"首个超限平台"逐一裁剪，会出现**多轮反复**——
 * 实测：首发超限平台是小红书（有标题，裁到 1000），重校验后轮到**快手**（无标题，
 * 标题计入首行）仍报 1021 > 1000。故一次性按**所有选中平台的最小预算**裁剪，
 * 保证裁剪后一次通过全部平台校验（上限为 0 = 不校验的平台忽略；全为 0 时返回 null）。
 *
 * @param {unknown} platforms 选中平台列表
 * @param {unknown} title 标题（无标题平台需从预算中扣除其长度）
 * @returns {number|null} 最小预算（字符数）；无任何受限平台时返回 null
 */
export function minContentBudget (platforms, title) {
  const list = [...new Set(Array.isArray(platforms) ? platforms : [])]
  const titleLen = Array.from(String(title ?? '')).length
  let min = Infinity
  for (const platform of list) {
    if (typeof platform !== 'string' || !platform.trim()) continue
    const limit = getPlatformContentLimit(platform)
    const max = Number(limit && limit.contentMax)
    if (!(max > 0)) continue
    const budget = isNoTitlePlatform(platform) ? Math.max(0, max - titleLen) : max
    if (budget < min) min = budget
  }
  return min === Infinity ? null : min
}

/**
 * 计算字符串的 UTF-8 字节长度（前端无 Node Buffer，用 TextEncoder）。
 * 百家号标题上限按 UTF-8 字节数校验，中文每字 3 字节、英文/数字 1 字节。
 * @param {unknown} value
 * @returns {number}
 */
export function utf8ByteLength (value) {
  const text = String(value ?? '')
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  // 兜底：无 TextEncoder 时按 UTF-8 码点精确计算字节数
  //（ASCII 1 字节、U+0080-U+07FF 2 字节、U+0800-U+FFFF 3 字节、补充平面 4 字节）
  let bytes = 0
  for (const ch of Array.from(text)) {
    const cp = ch.codePointAt(0)
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4
  }
  return bytes
}

/**
 * 按 UTF-8 字节数截断字符串到 maxBytes 字节内，避免把代理对（emoji 等）切成半个字符。
 * 用于百家号标题等按字节数校验的平台，保证不因标题超长阻断一键发布。
 * @param {unknown} value
 * @param {number} maxBytes
 * @returns {string}
 */
export function truncateByUtf8Bytes (value, maxBytes) {
  const text = String(value ?? '').trim()
  if (!(maxBytes > 0) || utf8ByteLength(text) <= maxBytes) return text
  const chars = Array.from(text)
  let bytes = 0
  const out = []
  for (const ch of chars) {
    const b = new TextEncoder().encode(ch).length
    if (bytes + b > maxBytes) break
    bytes += b
    out.push(ch)
  }
  return out.join('')
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
 *
 * 无标题平台（注册表 titleMode=caption：视频号/快手/微博/X/Instagram/TikTok）
 * 的发布链路会把标题作为描述首行插入（composeNoTitleDescription），因此
 * 校验口径为「标题 + 换行 + 正文」的合并长度对 contentMax；标题本身不再
 * 单独校验（这些平台没有独立标题字段）。有标题平台保持逐字段校验。
 *
 * @param {{ platforms?: unknown, article?: Record<string, unknown>, platformOverrides?: Record<string, unknown> }} options
 * @returns {{ valid: boolean, platform?: string, field?: string, limit?: number, actual?: number, unit?: string, message?: string }}
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

    // 无标题平台：标题合并进描述首行，只校验合并后的正文长度。
    // 合并口径复用注册表 composeNoTitleDescription（CCG 评审 W3：禁止第二份
    // 内联合并实现——任何一方单独修改会导致校验与实际合成行为漂移）。
    if (isNoTitlePlatform(platform)) {
      const combined = composeNoTitleDescription(title, content)
      const length = Array.from(combined).length
      if (limit.contentMax > 0 && length > limit.contentMax) {
        return {
          valid: false,
          platform,
          field: 'content',
          limit: limit.contentMax,
          actual: length,
          unit: '个字符',
          message: `${getPlatformLabel(platform)}正文最多 ${limit.contentMax} 个字符（标题计入首行），当前 ${length} 个`,
        }
      }
      continue
    }

    // 百家号标题按 UTF-8 字节数校验（titleMaxBytes），其余平台按字符数（titleMax）。
    const titleLimit = limit.titleMaxBytes !== undefined
      ? { max: limit.titleMaxBytes, unit: '字节' }
      : { max: limit.titleMax, unit: '个字符' }
    const fields = [
      ['title', title, titleLimit.max, '标题', titleLimit.unit],
      ['content', content, limit.contentMax, '正文', '个字符'],
    ]
    for (const [field, value, max, label, unit] of fields) {
      const length = unit === '字节' ? utf8ByteLength(value) : Array.from(value).length
      if (max > 0 && length > max) {
        return {
          valid: false,
          platform,
          field,
          limit: max,
          actual: length,
          unit,
          // 字符数平台保持历史文案「当前 N 个」，字节数平台用「当前 N 字节」，避免破坏预存测试
          message: unit === '字节'
            ? `${getPlatformLabel(platform)}${label}最多 ${max} 字节，当前 ${length} 字节`
            : `${getPlatformLabel(platform)}${label}最多 ${max} 个字符，当前 ${length} 个`,
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
