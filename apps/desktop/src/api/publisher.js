/**
 * 发布 API 封装 — 调用 Electron IPC
 * 所有 Vue 组件通过此文件访问 Electron IPC，不直接调用 window.electronAPI
 */
var _api = null; function getApi() { if (!_api) _api = window.electronAPI || null; return _api; }

// ─── 发布 API ─────────────────────────────
export async function publishWechat (article) {
  if (!getApi()) throw new Error('electronAPI not available')
  return getApi().publishWechat(article)
}

export async function publishBatch (platforms, article) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().publishBatch(platforms, article)
}

export function onProgress (callback) {
  if (!getApi()) return () => {}
  return getApi().onProgress(callback)
}

// ─── 队列 API ─────────────────────────────
export async function getQueueStatus () {
  if (!getApi()) return {}
  return getApi().getQueueStatus()
}

export async function getQueueHistory () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().getQueueHistory()
}

export async function cancelTask (taskId) {
  if (!getApi()) return { code: -1 }
  return getApi().cancelTask(taskId)
}

// ─── 发布历史 API ─────────────────────────
export async function historyList (opts) {
  if (!getApi()) return { code: 0, data: { total: 0, records: [] } }
  return getApi().historyList(opts)
}

export async function historyGet (id) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().historyGet(id)
}

// ─── 发布统计 API ──────────────────────────
export async function dashboardStats () {
  if (!getApi()) return { total: 0, success: 0, failed: 0, perPlatform: {}, daily: [] }
  return getApi().dashboardStats()
}

// ─── 定时发布 API ─────────────────────────
export async function schedulerCreate (schedule) {
  if (!getApi()) return { code: -1 }
  return getApi().schedulerCreate(schedule)
}

export async function schedulerList () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().schedulerList()
}

export async function schedulerCancel (id) {
  if (!getApi()) return { code: -1 }
  return getApi().schedulerCancel(id)
}

// ─── 账号管理 API ─────────────────────────
export async function listAccounts () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().listAccounts()
}

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

export async function accountSetDefault (platform, accountId) {
  if (!getApi()) return
  return getApi().accountSetDefault(platform, accountId)
}

export async function accountUpdate (id, fields) {
  if (!getApi()) return
  return getApi().accountUpdate(id, fields)
}

// ─── 内嵌浏览器登录 API ──────────────────
export async function authOpenLogin (platform) {
  if (!getApi()) return { code: -1 }
  return getApi().authOpenLogin(platform)
}

export async function authClose () {
  if (!getApi()) return
  return getApi().authClose()
}

export function onAuthViewOpened (callback) {
  if (!getApi()) return () => {}
  return getApi().onAuthViewOpened(callback)
}

export function onAuthCompleted (callback) {
  if (!getApi()) return () => {}
  return getApi().onAuthCompleted(callback)
}

export function onAuthViewClosed (callback) {
  if (!getApi()) return () => {}
  return getApi().onAuthViewClosed(callback)
}

// ─── 渲染 API ────────────────────────────
export async function renderStart (data) {
  if (!getApi()) throw new Error('electronAPI not available')
  return getApi().renderStart(data)
}

export async function renderCancel () {
  if (!getApi()) return {}
  return getApi().renderCancel()
}

export async function renderGetStatus () {
  if (!getApi()) return {}
  return getApi().renderGetStatus()
}

export function onRenderProgress (callback) {
  if (!getApi()) return () => {}
  return getApi().onRenderProgress(callback)
}

export function onRenderComplete (callback) {
  if (!getApi()) return () => {}
  return getApi().onRenderComplete(callback)
}

export function onRenderError (callback) {
  if (!getApi()) return () => {}
  return getApi().onRenderError(callback)
}

// ─── 内容情报 API ────────────────────────
export async function intelligenceSearch (query) {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().intelligenceSearch(query)
}

export async function intelligenceSearchTitles (query) {
  if (!getApi()) return []
  return getApi().intelligenceSearchTitles(query)
}

export async function intelligenceFetchTrending () {
  if (!getApi()) return []
  return getApi().intelligenceFetchTrending()
}

export async function intelligenceSuggestTags (content, opts) {
  if (!getApi()) return null
  return getApi().intelligenceSuggestTags(content, opts)
}

export async function intelligenceFindReferences (url) {
  if (!getApi()) return []
  return getApi().intelligenceFindReferences(url)
}

export async function intelligenceGetOptimalTime (keyword) {
  if (!getApi()) return null
  return getApi().intelligenceGetOptimalTime(keyword)
}

export async function intelligenceGetBenchmark (opts) {
  if (!getApi()) return null
  return getApi().intelligenceGetBenchmark(opts)
}

// ─── 关键词监测 API ──────────────────────
export async function keywordStatus () {
  if (!getApi()) return { code: 0, data: {} }
  return getApi().keywordStatus()
}

export async function keywordStart (keyword, opts) {
  if (!getApi()) return { code: -1 }
  return getApi().keywordStart(keyword, opts)
}

export async function keywordStop (keyword) {
  if (!getApi()) return { code: -1 }
  return getApi().keywordStop(keyword)
}

export async function keywordHistory (keyword) {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().keywordHistory(keyword)
}

// ─── 爆款分析 API ────────────────────────
export async function viralAnalyze (keyword) {
  if (!getApi()) return { code: -1 }
  return getApi().viralAnalyze(keyword)
}

export async function viralGenerate (opts) {
  if (!getApi()) return { code: -1 }
  return getApi().viralGenerate(opts)
}

// ─── 平台配置 API ────────────────────────
export async function platformList () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().platformList()
}

export async function platformGet (id) {
  if (!getApi()) return { code: -1 }
  return getApi().platformGet(id)
}

export async function getPlatformDefinitions () {
  if (!getApi()) return { code: -1 }
  return getApi().getPlatformDefinitions()
}

// ─── 敏感词 API ──────────────────────────
export async function sensitiveCheck (text) {
  if (!getApi()) return { code: -1 }
  return getApi().sensitiveCheck(text)
}

export async function sensitiveReplace (text) {
  if (!getApi()) return { code: -1 }
  return getApi().sensitiveReplace(text)
}

// ─── 数据同步 API ────────────────────────
export async function syncAll () {
  if (!getApi()) return { code: -1 }
  return getApi().syncAll()
}

export async function syncPlatform (platform) {
  if (!getApi()) return { code: -1 }
  return getApi().syncPlatform(platform)
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


// ─── 全局存储 API ─────────────────────────
export async function storeGetSetting (key) {
  if (!getApi()) return null
  return getApi().storeGetSetting(key)
}

export async function storeSetSetting (key, value) {
  if (!getApi()) return
  return getApi().storeSetSetting(key, value)
}

export async function storeAddPublishRecord (record) {
  if (!getApi()) return null
  return getApi().storeAddPublishRecord(record)
}

export async function storeListPublishHistory (opts) {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().storeListPublishHistory(opts)
}

// ─── OAuth API ────────────────────────────
export async function oauthStart (opts) {
  if (!getApi()) return { code: -1 }
  return getApi().oauthStart(opts)
}

export async function oauthClose () {
  if (!getApi()) return
  return getApi().oauthClose()
}

export function onOAuthCompleted (callback) {
  if (!getApi()) return () => {}
  return getApi().onOAuthCompleted(callback)
}

// ─── 批量发布 API ─────────────────────────
export async function batchCreate (batch) {
  if (!getApi()) return { code: -1 }
  return getApi().batchCreate(batch)
}

export async function batchList () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().batchList()
}

export async function batchDelete (id) {
  if (!getApi()) return
  return getApi().batchDelete(id)
}

export function onBatchProgress (callback) {
  if (!getApi()) return () => {}
  return getApi().onBatchProgress(callback)
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

// ─── 通知 API ────────────────────────────
export function showNotification (data) {
  if (!getApi()) return
  return getApi().showNotification(data)
}
