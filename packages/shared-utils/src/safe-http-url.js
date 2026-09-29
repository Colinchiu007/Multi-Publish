'use strict'
/**
 * safe-http-url.js — 「只允许 http/https」URL 判定（单一数据源，主进程侧）
 *
 * 存在理由（PRD-HREF-SCHEME-GUARD-2026-09-29）：
 * 渲染层多处把**外部可控**的 url 字段直绑 `<a :href>`：
 *   - `content-intelligence-sources.js` 的 Hacker News 分支 `url: d.url`（Algolia 的
 *     story url 由提交人任意填写），GitHub 分支 `url: d.html_url`；
 *   - `hot-topics/channels.js` 各榜单解析器（知乎/微博/抖音等第三方 JSON）。
 * Vue 3 **不做**任何 href 净化（Vue 2 时代的 `isUnsafeURL` 守卫在 v3 已移除，见
 * vuejs/vue#8585 与 v3 `runtime-dom` 不设 URL 白名单的事实），而本应用渲染进程持有
 * `window.electronAPI`（preload 暴露的受信任 IPC 面）。于是 `javascript:` 一旦进入 href，
 * 用户点一下就等于在应用特权上下文里跑任意 JS——不是"打开个坏网页"的量级。
 *
 * 口径（三条，不可放宽）：
 *   1. **只按前缀放行** `http://` 与 `https://`（大小写不敏感）。不做"清洗后放行"，
 *      因为任何归一化（剥控制字符、HTML 实体解码、补协议）都在给绕过面添砖。
 *   2. 不通过判据一律返回 `null`，由调用点**不产出锚点**（降级为等样式纯文本），
 *      而不是"渲染一个点了没反应的链接"——内容不丢，可点击性丢。
 *   3. 返回值是去首尾空白后的**原串**，绝不重编码，保证链接目标与来源逐字一致。
 *
 * 协议相对（`//host/x`）与缺协议（`example.com`）同样返回 null：在 `file://` 宿主下
 * 前者解析成 `file://host`、后者解析成相对路径，都不是可点击的正确目标。
 *
 * 渲染端消费的是 `safe-http-url.browser.js`（ESM 孪生，由 apps/desktop/vite.config.js
 * 的 alias 指过去；浏览器不能执行 CommonJS 的 `module.exports`）。
 * 两份的判据正则由 `src/__tests__/safe-http-url.test.js` 按 `source`+`flags` 锁同源。
 */

/** 唯一判据：必须以 http:// 或 https:// 开头 */
const HTTP_URL_RE = /^https?:\/\//i

/**
 * @param {unknown} value — 任意来源的 url 字段（第三方 API、平台回传、历史记录、项目元数据）
 * @returns {string|null} 通过判据则返回去空白后的原串，否则 null
 */
function safeHttpUrl (value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!HTTP_URL_RE.test(trimmed)) return null
  return trimmed
}

/**
 * 分享文本 URL 提取（2026-10-08 自 Collection.vue 收敛——渲染层协议正则零字面量合同）。
 * 从用户粘贴的分享文本中提取全部 http(s) 链接：CJK 字符天然终止匹配（容忍中文/emoji
 * 混排），尾部粘连标点清理（中英文句读，防止 URL 吞掉句号逗号；URL 体内的括号/引号
 * 合法保留），末尾经 HTTP_URL_RE（共享判据）复验。提取属「采集」意图；绑定 href 前
 * 调用方仍须过 safeHttpUrl（双档合同：采集侧收口 + 渲染侧再判）。
 * @param {unknown} text — 分享文本（任意来源）
 * @returns {string[]} 提取并清理后的 http(s) URL 列表（无匹配返回 []）
 */
const SHARE_TEXT_URL_RE = /https?:\/\/[^\s<>"'`\\\u2018\u2019\u201c\u201d\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef\u{1f000}-\u{1faff}]+/giu
const SHARE_TEXT_TRAILING_JUNK_RE = /[.,;:!?)\]}>'"\u3001\u3002\uff0c\uff01\uff1f\uff09\u3011\u300b\u201d\u2019]+$/

function extractShareTextUrls (text) {
  const raw = String(text == null ? '' : text).trim()
  if (!raw) return []
  const matches = raw.match(SHARE_TEXT_URL_RE) || []
  return matches
    .map((u) => u.replace(SHARE_TEXT_TRAILING_JUNK_RE, ''))
    .filter((u) => HTTP_URL_RE.test(u))
}

module.exports = {
  safeHttpUrl,
  HTTP_URL_RE,
  extractShareTextUrls,
  SHARE_TEXT_URL_RE,
  SHARE_TEXT_TRAILING_JUNK_RE,
}
