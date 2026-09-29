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
