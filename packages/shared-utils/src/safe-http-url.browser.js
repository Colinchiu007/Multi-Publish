// 渲染端（vite dev / build）使用的 ESM 孪生文件。
// 主进程仍使用 safe-http-url.js（CommonJS），避免改变 Node 端契约。
// 判据必须与 safe-http-url.js 逐字同源（`source` + `flags` 由
// packages/shared-utils/src/__tests__/safe-http-url.test.js 的 parity 回归拦截），
// 口径与存在理由（第三方 url 字段可控 + Vue 3 不净化 href + 渲染进程持有 electronAPI）
// 见该文件头注释与 01-docs/PRD-HREF-SCHEME-GUARD-2026-09-29.md。
export const HTTP_URL_RE = /^https?:\/\//i

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function safeHttpUrl (value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!HTTP_URL_RE.test(trimmed)) return null
  return trimmed
}

// 分享文本 URL 提取（与 safe-http-url.js 逐字同源；口径见该文件注释）：
// CJK 终止匹配 + 尾部粘连标点清理 + HTTP_URL_RE 复验。
export const SHARE_TEXT_URL_RE = /https?:\/\/[^\s<>"'`\\\u2018\u2019\u201c\u201d\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef\u{1f000}-\u{1faff}]+/giu
export const SHARE_TEXT_TRAILING_JUNK_RE = /[.,;:!?)\]}>'"\u3001\u3002\uff0c\uff01\uff1f\uff09\u3011\u300b\u201d\u2019]+$/

/**
 * @param {unknown} text — 分享文本（任意来源）
 * @returns {string[]} 提取并清理后的 http(s) URL 列表（无匹配返回 []）
 */
export function extractShareTextUrls (text) {
  const raw = String(text == null ? '' : text).trim()
  if (!raw) return []
  const matches = raw.match(SHARE_TEXT_URL_RE) || []
  return matches
    .map((u) => u.replace(SHARE_TEXT_TRAILING_JUNK_RE, ''))
    .filter((u) => HTTP_URL_RE.test(u))
}
