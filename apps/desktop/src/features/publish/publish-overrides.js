/**
 * publish-overrides.js — 平台差异化内容（override）与内容格式的归一化单一真源
 *
 * 自 usePublishFlow.js 迁出（P2-7 批量模式字段面，2026-10-09）。迁出理由：单篇与批量必须
 * 共用同一份归一化——两份必然漂移，漂移表现为「批量面板可编辑但发布不生效」（CCG codex W1
 * 同族缺陷的第二落点）。publish-contract.js 已 463 行且受逐文件行数门禁 500 行上限约束，
 * 故单独成模块，不并入。
 */
import { getPlatformOverrideFields } from '@multi-publish/shared-utils/src/publish-capabilities'

const MARKDOWN_RE = /^#\s|^\*\*|^>\s|^```/m
const MARKDOWN_LINK_RE = /\[.+\]\(.+\)/

export function isMarkdownContent (content) {
  return MARKDOWN_RE.test(content) || MARKDOWN_LINK_RE.test(content)
}

// 注册表字段查询缓存（注册表数据冻结，缓存安全）
const overrideFieldsCache = new Map()

export function platformOverrideFieldsFor (platform) {
  if (!overrideFieldsCache.has(platform)) {
    overrideFieldsCache.set(platform, getPlatformOverrideFields(platform, { uiOnly: true }))
  }
  return overrideFieldsCache.get(platform)
}

/**
 * 按注册表字段定义归一化单个覆盖值（与 PlatformOverridePanel.normalizeValue 同口径）。
 * 返回 undefined 表示该字段无有效值（不进 payload）。
 */
export function normalizeOverrideValue (field, raw) {
  if (field.type === 'checkbox') {
    return typeof raw === 'boolean' ? raw : undefined
  }
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : []
    const matched = options.find(option => String(option.value) === String(raw))
    return matched ? matched.value : undefined
  }
  if (field.type === 'tags') {
    if (!Array.isArray(raw)) return undefined
    const list = [...new Set(raw.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))]
    return list.length > 0 ? list : undefined
  }
  if (field.type === 'collection') {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return undefined
  }
  // text / textarea：非空才透传；maxLen 按码点截断（不切断代理对）
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const text = raw.trim()
  const maxLen = Number(field.maxLen)
  if (maxLen > 0) {
    const chars = Array.from(text)
    return chars.length > maxLen ? chars.slice(0, maxLen).join('') : text
  }
  return text
}

export function normalizePlatformOverrides (overrides) {
  if (!overrides || typeof overrides !== 'object') return {}
  return Object.fromEntries(Object.entries(overrides).flatMap(([platform, value]) => {
    if (!value || typeof value !== 'object') return []
    const normalized = {
      title: typeof value.title === 'string' ? value.title : '',
      content: typeof value.content === 'string' ? value.content : '',
    }
    // 注册表驱动的平台特有字段归一化（CCG codex W1 修复，2026-10-08）：
    // 旧硬编码白名单只保留知乎/抖音/公众号少数字段，B站分区/版权/合集、
    // YouTube 分类/可见性/播放列表、TikTok 可见性、百家号原创/位置/合集、
    // 公众号摘要/评论开关等注册表面板字段在 IPC 组装前被静默丢弃——
    // UI 可编辑但发布不生效。现按注册表字段与类型归一化，与面板同口径。
    for (const field of platformOverrideFieldsFor(platform)) {
      const normalizedValue = normalizeOverrideValue(field, value[field.key])
      if (normalizedValue !== undefined) normalized[field.key] = normalizedValue
    }
    // 无任何有效差异内容（标题/正文/任一特有字段）的条目不进 payload
    const hasPayload = Boolean(normalized.title || normalized.content)
      || Object.keys(normalized).some(key => key !== 'title' && key !== 'content')
    if (!hasPayload) return []
    return [[platform, normalized]]
  }))
}
