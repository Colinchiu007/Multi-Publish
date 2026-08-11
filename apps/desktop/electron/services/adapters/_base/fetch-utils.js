// @ts-check
/**
 * fetch-utils.js — 有界超时 fetch 助手
 *
 * 背景（2026-08-11 质量节拍 E2E 复盘）：多数 provider adapter 声明了
 * DEFAULT_TIMEOUT 但从未把超时接入 fetch（`fetch(url, { ...opts, headers })`），
 * 上游卡住时请求在后台无限挂起。callAdapter 的 withCallTimeout 会兜底让调用链
 * 在 2 分钟收敛，但底层 fetch 仍占用连接，且错误发生时间被推迟到兜底超时。
 * 本助手把 timeout 直接接入 AbortSignal，超时立即以 AbortError 抛给调用方，
 * 由 adapter 的 _request 归一化为 ProviderError(TIMEOUT)。
 */

'use strict'

/**
 * 带超时的 fetch：timeoutMs 内未完成即 abort。
 * @param {string|URL} url
 * @param {RequestInit & {headers?: Record<string,string>}} [opts]
 * @param {number} [timeoutMs] 默认 60000
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout (url, opts = {}, timeoutMs = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { fetchWithTimeout }
