/**
 * 发布 API 封装 — 调用 Electron IPC
 */
var _api = null; function getApi() { if (!_api) _api = window.electronAPI || null; return _api; }

export async function publishWechat (article) {
  if (!getApi()) throw new Error('electronAPI not available')
  return getApi().publishWechat(article)
}

export async function publishBatch (platforms, article) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().publishBatch(platforms, article)
}

export async function listAccounts () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().listAccounts()
}

export function onProgress (callback) {
  if (!getApi()) return () => {}
  return getApi().onProgress(callback)
}

// ─── 队列 API ─────────────────────────────
export async function queueStatus () {
  if (!getApi()) return {}
  return getApi().queueStatus()
}

export async function queueHistory () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().queueHistory()
}

// ─── 账号管理 API ─────────────────────────
export async function accountAdd (platform) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().accountAdd(platform)
}

export async function accountDelete (accountId) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().accountDelete(accountId)
}

export async function accountCheckLogin (platform, accountId) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().accountCheckLogin(platform, accountId)
}

export async function accountList () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().accountList()
}

// ─── 发布统计 API ──────────────────────────
export async function dashboardStats () {
  if (!getApi()) return { total: 0, success: 0, failed: 0, perPlatform: {}, daily: [] }
  return getApi().dashboardStats()
}

// ─── 自动更新 API ──────────────────────────
export async function updateCheck () {
  if (!getApi()) return {}
  return getApi().updateCheck()
}
export async function updateDownload () {
  if (!getApi()) return {}
  return getApi().updateDownload()
}
export async function updateInstall () {
  if (!getApi()) return {}
  return getApi().updateInstall()
}
export function onUpdateStatus (callback) {
  if (!getApi()) return () => {}
  return getApi().onUpdateStatus(callback)
}

// ─── 首次运行引导 API ──────────────────────
export async function firstRunCheck () {
  if (!getApi()) return { setupDone: false }
  return getApi().firstRunCheck()
}
export function onFirstRunStatus (callback) {
  if (!getApi()) return () => {}
  return getApi().onFirstRunStatus(callback)
}