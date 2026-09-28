// 渲染端（vite dev / build）使用的 ESM 发布能力注册表孪生文件。
// 主进程仍使用 publish-capabilities.js（CommonJS），避免改变 Node 端契约。
// 数据单一来源：publish-capabilities.json（两侧共同消费，禁止复制数据）。
// 函数层与 CJS 版逐字对齐；漂移由 __tests__/publish-capabilities.test.js 的
// parity 回归拦截（对齐 account-name-guard / platform-definitions 孪生先例）。
import registryData from './publish-capabilities.json'

export const PLATFORM_PUBLISH_META = Object.freeze(
  Object.fromEntries(Object.entries(registryData.platforms).map(([id, meta]) => [
    id,
    Object.freeze({
      titleMode: meta.titleMode,
      limits: Object.freeze({ ...meta.limits }),
    }),
  ]))
)

export const NO_TITLE_PLATFORMS = Object.freeze(
  Object.keys(registryData.platforms).filter(id => registryData.platforms[id].titleMode === 'caption')
)

const COMMON_FORM_FIELDS = Object.freeze(
  registryData.commonFormFields.map(field => Object.freeze({ ...field, platforms: Object.freeze([...field.platforms]) }))
)

const OVERRIDE_FIELDS = Object.freeze(
  Object.fromEntries(Object.entries(registryData.overrideFields).map(([id, fields]) => [
    id,
    Object.freeze(fields.map(field => Object.freeze({ ...field }))),
  ]))
)

const VALID_TITLE_MODES = Object.freeze(['title', 'caption'])
const VALID_STATUSES = Object.freeze(['implemented', 'platform-capable'])

export function getPlatformPublishMeta (platformId) {
  const meta = PLATFORM_PUBLISH_META[String(platformId || '')]
  if (!meta) return null
  return { titleMode: meta.titleMode, limits: { ...meta.limits } }
}

export function isNoTitlePlatform (platformId) {
  return NO_TITLE_PLATFORMS.includes(String(platformId || ''))
}

export function getNoTitlePlatforms () {
  return [...NO_TITLE_PLATFORMS]
}

export function getPlatformContentLimit (platformId) {
  const meta = getPlatformPublishMeta(platformId)
  if (!meta) return { titleMax: 100, contentMax: 5000 }
  return { ...meta.limits }
}

export function getPlatformOverrideFields (platformId, options = {}) {
  const fields = OVERRIDE_FIELDS[String(platformId || '')] || []
  const list = options.uiOnly
    ? fields.filter(field => field.uiExposed && field.status === 'implemented')
    : [...fields]
  // 深拷贝（options 选项对象与 default 数组一并复制）：浅拷贝会让调用方通过
  // 返回值突变污染冻结的全局注册表（CCG 评审 W5 实锤：options 共享引用可突变）。
  return list.map(field => ({
    ...field,
    ...(Array.isArray(field.options) ? { options: field.options.map(option => ({ ...option })) } : {}),
    ...(Array.isArray(field.default) ? { default: [...field.default] } : {}),
  }))
}

export function getCommonFormFields () {
  return COMMON_FORM_FIELDS.map(field => ({ ...field, platforms: [...field.platforms] }))
}

export function getFieldSupport (semanticKey) {
  const platforms = []
  const statuses = []
  for (const field of COMMON_FORM_FIELDS) {
    if (field.semantic === semanticKey) {
      platforms.push(...field.platforms)
      statuses.push('implemented')
    }
  }
  for (const platformId of Object.keys(OVERRIDE_FIELDS)) {
    for (const field of OVERRIDE_FIELDS[platformId]) {
      if (field.semantic === semanticKey) {
        platforms.push(platformId)
        statuses.push(field.status)
      }
    }
  }
  // 去重：同一语义可能同时出现在通用矩阵与该平台的覆盖字段（如 topics），
  // count 按唯一平台数计，与 classifyPublishFields 的计数口径一致。
  const unique = [...new Set(platforms)]
  return { count: unique.length, platforms: unique, statuses }
}

export function classifyPublishFields () {
  const semantics = new Map()
  for (const field of COMMON_FORM_FIELDS) {
    if (!semantics.has(field.semantic)) {
      semantics.set(field.semantic, { semantic: field.semantic, label: field.label, platforms: [], statuses: [] })
    }
    const entry = semantics.get(field.semantic)
    entry.platforms.push(...field.platforms)
    entry.statuses.push('implemented')
  }
  for (const platformId of Object.keys(OVERRIDE_FIELDS)) {
    for (const field of OVERRIDE_FIELDS[platformId]) {
      if (!semantics.has(field.semantic)) {
        semantics.set(field.semantic, { semantic: field.semantic, label: field.label, platforms: [], statuses: [] })
      }
      const entry = semantics.get(field.semantic)
      entry.platforms.push(platformId)
      entry.statuses.push(field.status)
    }
  }

  const common = []
  const semiCommon = []
  const unique = []
  for (const entry of semantics.values()) {
    const platforms = [...new Set(entry.platforms)]
    const item = {
      semantic: entry.semantic,
      label: entry.label,
      count: platforms.length,
      platforms,
      statuses: [...entry.statuses],
    }
    if (platforms.length >= 3) common.push(item)
    else if (platforms.length === 2) semiCommon.push(item)
    else unique.push(item)
  }
  const byCountDesc = (a, b) => b.count - a.count || String(a.semantic).localeCompare(String(b.semantic))
  common.sort(byCountDesc)
  semiCommon.sort(byCountDesc)
  unique.sort(byCountDesc)
  return { common, semiCommon, unique }
}

export function composeNoTitleDescription (title, content, options = {}) {
  const parts = [title, content]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(value => value.length > 0)
  const composed = parts.join('\n')
  const maxLen = Number(options && options.maxLen)
  if (!(maxLen > 0)) return composed
  const chars = Array.from(composed)
  return chars.length > maxLen ? chars.slice(0, maxLen).join('') : composed
}

export function validateRegistry () {
  const problems = []
  const platformIds = Object.keys(registryData.platforms)
  for (const platformId of platformIds) {
    const meta = registryData.platforms[platformId]
    if (!VALID_TITLE_MODES.includes(meta.titleMode)) {
      problems.push(`${platformId}: 非法 titleMode ${meta.titleMode}`)
    }
    if (!(Number(meta.limits && meta.limits.contentMax) > 0)) {
      problems.push(`${platformId}: contentMax 必须为正数`)
    }
  }
  for (const platformId of Object.keys(registryData.overrideFields)) {
    if (!platformIds.includes(platformId)) {
      problems.push(`overrideFields 含未知平台 ${platformId}`)
    }
    for (const field of registryData.overrideFields[platformId]) {
      if (!VALID_STATUSES.includes(field.status)) {
        problems.push(`${platformId}.${field.key}: 非法 status ${field.status}`)
      }
      if (field.status === 'platform-capable' && !field.note) {
        problems.push(`${platformId}.${field.key}: platform-capable 字段必须带 note 证据`)
      }
    }
  }
  for (const field of registryData.commonFormFields) {
    for (const platformId of field.platforms) {
      if (!platformIds.includes(platformId)) {
        problems.push(`commonFormFields.${field.key}: 未知平台 ${platformId}`)
      }
    }
  }
  return problems
}
