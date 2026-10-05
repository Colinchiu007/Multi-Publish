// @ts-check
/**
 * rpa-publish-id-extract.js — 发布成功判定用的 publish-id 提取工具（纯函数）
 *
 * 拆分自 rpa-view-platforms.js (2026-09-29)：原文件超逐文件行数门禁
 * （check-max-lines LEDGER_GREW，Main 1384≈登记 1215+容差上限 1415）。
 * 本模块收纳与「从 URL/响应体/证据里提取发布 ID（postId）以判定发布成功」
 * 相关的纯函数——无 this 依赖、不触 mixin 其他方法，拆出零行为变化。
 *
 * 依赖：仅模块内互调 + 内置正则/URL。
 */
'use strict'

const PUBLISH_ID_KEYS = /(?:post|article|media|content|clue|work|video|photo|material|resource|publish)[_-]?id$/i
const PUBLISH_ID_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const PUBLISH_ID_NAV_WORDS = new Set(['article', 'articles', 'content', 'manage', 'video', 'edit', 'publish', 'list', 'lists', 'page', 'media', 'photo', 'clue', 'builder', 'pcui', 'status', 'create', 'upload', 'works', 'work', 'new', 'draft', 'detail', 'index', 'home'])

// B 站的作品标识既不用通用键名（是 aid/bvid），也常把 id 直接放在 /video/ 之后。
// 把 'video' 裸加进路径段关键词表会造出假 id：投稿页自身 URL
// `member.bilibili.com/platform/upload/video/frame` 会被切成 frame（不在 nav 词表里，拦不住），
// 于是「发布失败」被报成「成功」。因此判据一律落在**值的形态**上，并额外限定主机。
// 依据与实测现场：docs/PRD-BILIBILI-PUBLISH-ID-EXTRACT-2026-10-06.md §二/§四。
const BILIBILI_HOST = /(?:^|\.)bilibili\.(?:com|tv)$/i
const BILIBILI_WORK_ID_SHAPE = /^(?:BV[0-9A-Za-z]{5,20}|av\d{4,})$/
const BILIBILI_AID_SHAPE = /^\d{4,}$/

/** B 站 aid/bvid 键：只有值合形态才采纳，不按键名盲取 */
function matchBilibiliWorkIdKey (key, value) {
  const name = String(key || '').toLowerCase()
  const raw = typeof value === 'number' ? String(value) : (typeof value === 'string' ? value.trim() : '')
  if (!raw) return null
  if (name === 'bvid' && BILIBILI_WORK_ID_SHAPE.test(raw)) return normalizePublishId(raw)
  if (name === 'aid' && BILIBILI_AID_SHAPE.test(raw)) return normalizePublishId(raw)
  return null
}

/** 规范化候选发布 ID：不合法返回 null */
function normalizePublishId (value) {
  if (value === null || value === undefined) return null
  const id = String(value).trim()
  if (!id || id.length > 160 || id.toLowerCase().startsWith('task_') || /^(?:true|false|null|undefined)$/i.test(id) || PUBLISH_ID_NAV_WORDS.has(id.toLowerCase()) || !PUBLISH_ID_VALUE.test(id)) return null
  return id
}

/** 递归收集对象里所有 key 命中发布 ID 命名的值（规范化后去空） */
function collectPublishIds (value, key, ids) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach(item => collectPublishIds(item, key, ids))
    return
  }
  if (typeof value !== 'object') {
    const keyName = String(key || '')
    if (PUBLISH_ID_KEYS.test(keyName)) {
      const id = normalizePublishId(value)
      if (id) ids.push(id)
      return
    }
    const workId = matchBilibiliWorkIdKey(keyName, value)
    if (workId) ids.push(workId)
    return
  }
  Object.entries(value).forEach(([childKey, childValue]) => collectPublishIds(childValue, childKey, ids))
}

/** 从页面 URL（query param 或 pathname 段）提取发布 ID */
function extractPublishIdFromUrl (url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const isBilibili = BILIBILI_HOST.test(parsed.hostname)
    const params = [...parsed.searchParams.entries()]
    for (const [key, value] of params) {
      if (isBilibili) {
        const workId = matchBilibiliWorkIdKey(key, value)
        if (workId) return workId
      }
      if (PUBLISH_ID_KEYS.test(key)) {
        const id = normalizePublishId(value)
        if (id) return id
      }
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!/(?:post|article|media|content|clue|work)/i.test(parts[index])) continue
      const id = normalizePublishId(parts[index + 1])
      if (id) return id
    }
    // 通用判据之后才按 B 站形态兜底，保证其余平台结论逐字不变
    if (isBilibili) {
      const workId = parts.find(part => BILIBILI_WORK_ID_SHAPE.test(part))
      if (workId) return normalizePublishId(workId)
    }
  } catch (_) { /* 页面 URL 可能暂时不是绝对 URL */ }
  return null
}

/** 从响应体（JSON 递归 / 正则兜底）提取全部发布 ID（去重） */
function extractPublishIdsFromResponseBody (body) {
  const ids = []
  try {
    collectPublishIds(JSON.parse(String(body || '')), '', ids)
  } catch (_) {
    const matches = String(body || '').match(/(?:post|article|media|content|clue|work|video|photo|material|resource|publish)[_-]?(?:id)?["'=:\s]+([A-Za-z0-9][A-Za-z0-9._:-]{3,})/ig) || []
    matches.forEach(match => {
      const value = match.split(/["'=:\s]+/).pop()
      const id = normalizePublishId(value)
      if (id) ids.push(id)
    })
  }
  return [...new Set(ids)]
}

/** 从发布证据数组（含 publishIds 字段）提取首个合法发布 ID */
function extractPublishIdFromEvidence (evidence = []) {
  const ids = []
  ;(Array.isArray(evidence) ? evidence : []).forEach(item => {
    if (!item || typeof item !== 'object') return
    ;(Array.isArray(item.publishIds) ? item.publishIds : []).forEach(value => {
      const id = normalizePublishId(value)
      if (id) ids.push(id)
    })
  })
  return [...new Set(ids)][0] || null
}

// 日志/诊断用：脱敏打印统一落在「端末诊断」语义，不触凭证（SENSITIVE 键剔除）。
const SENSITIVE_URL_QUERY_KEY = /(?:token|auth|cookie|session|signature|sign|credential|secret|ticket|code|sid)/i

/** 诊断记录端点脱敏：保留 origin+pathname，剥 query/hash */
function sanitizeDiagnosticEndpoint (url) {
  try {
    const parsed = new URL(String(url || ''))
    return parsed.origin + parsed.pathname
  } catch (_) {
    return ''
  }
}

/** 发布结果 URL 脱敏：剔除敏感 query key + hash */
function sanitizePublishResultUrl (url) {
  try {
    const parsed = new URL(String(url || ''))
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_URL_QUERY_KEY.test(key)) parsed.searchParams.delete(key)
    }
    parsed.hash = ''
    return parsed.toString()
  } catch (_) {
    return ''
  }
}

module.exports = {
  normalizePublishId,
  collectPublishIds,
  extractPublishIdFromUrl,
  extractPublishIdsFromResponseBody,
  extractPublishIdFromEvidence,
  sanitizeDiagnosticEndpoint,
  sanitizePublishResultUrl,
}