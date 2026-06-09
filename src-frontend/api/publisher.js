/**
 * 发布 API 封装 — 调用 Electron IPC
 */
const api = window.electronAPI

export async function publishWechat (article) {
  if (!api) throw new Error('electronAPI not available')
  return api.publishWechat(article)
}

export async function publishBatch (platforms, article) {
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.publishBatch(platforms, article)
}

export async function listAccounts () {
  if (!api) return { code: 0, data: [] }
  return api.listAccounts()
}

export function onProgress (callback) {
  if (!api) return () => {}
  return api.onProgress(callback)
}

// ─── 队列 API ─────────────────────────────
export async function queueStatus () {
  if (!api) return {}
  return api.queueStatus()
}

export async function queueHistory () {
  if (!api) return { code: 0, data: [] }
  return api.queueHistory()
}

// ─── 账号管理 API ─────────────────────────
export async function accountAdd (platform) {
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.accountAdd(platform)
}

export async function accountDelete (accountId) {
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.accountDelete(accountId)
}

export async function accountCheckLogin (platform, accountId) {
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.accountCheckLogin(platform, accountId)
}

export async function accountList () {
  if (!api) return { code: 0, data: [] }
  return api.accountList()
}

// ─── 发布统计 API ──────────────────────────
export async function dashboardStats () {
  if (!api) return { total: 0, success: 0, failed: 0, perPlatform: {}, daily: [] }
  return api.dashboardStats()
}