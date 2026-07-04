/**
 * 鍙戝竷 API 灏佽 鈥?璋冪敤 Electron IPC
 * 鎵€鏈?Vue 缁勪欢閫氳繃姝ゆ枃浠惰闂?Electron IPC锛屼笉鐩存帴璋冪敤 window.electronAPI
 */
var _api = null; function getApi() { if (!_api) _api = window.electronAPI || null; return _api; }

// 鈹€鈹€鈹€ 鍙戝竷 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 闃熷垪 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鍙戝竷鍘嗗彶 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function historyList (opts) {
  if (!getApi()) return { code: 0, data: { total: 0, records: [] } }
  return getApi().historyList(opts)
}

export async function historyGet (id) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().historyGet(id)
}

// 鈹€鈹€鈹€ 鍙戝竷缁熻 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function dashboardStats () {
  if (!getApi()) return { total: 0, success: 0, failed: 0, perPlatform: {}, daily: [] }
  return getApi().dashboardStats()
}

// 鈹€鈹€鈹€ 瀹氭椂鍙戝竷 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 璐﹀彿绠＄悊 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鍐呭祵娴忚鍣ㄧ櫥褰?API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 娓叉煋 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

export async function renderInstallDeps () {
  if (!getApi()) return { success: false, error: 'electronAPI not available' }
  return getApi().renderInstallDeps()
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

export function onRenderInstallProgress (callback) {
  if (!getApi()) return () => {}
  return getApi().onRenderInstallProgress(callback)
}

// 鈹€鈹€鈹€ 鍐呭鎯呮姤 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鍏抽敭璇嶇洃娴?API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鐖嗘鍒嗘瀽 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function viralAnalyze (keyword) {
  if (!getApi()) return { code: -1 }
  return getApi().viralAnalyze(keyword)
}

export async function viralGenerate (opts) {
  if (!getApi()) return { code: -1 }
  return getApi().viralGenerate(opts)
}

// 鈹€鈹€鈹€ 骞冲彴閰嶇疆 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鏁忔劅璇?API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function sensitiveCheck (text) {
  if (!getApi()) return { code: -1 }
  return getApi().sensitiveCheck(text)
}

export async function sensitiveReplace (text) {
  if (!getApi()) return { code: -1 }
  return getApi().sensitiveReplace(text)
}

// 鈹€鈹€鈹€ 鏁版嵁鍚屾 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function syncAll () {
  if (!getApi()) return { code: -1 }
  return getApi().syncAll()
}

export async function syncPlatform (platform) {
  if (!getApi()) return { code: -1 }
  return getApi().syncPlatform(platform)
}

// 鈹€鈹€鈹€ 鑷姩鏇存柊 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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


// 鈹€鈹€鈹€ 鍏ㄥ眬瀛樺偍 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ OAuth API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鎵归噺鍙戝竷 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鏀粯 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function paymentCreateOrder (options) {
  if (!getApi()) return { code: -1 }
  return getApi().paymentCreateOrder(options)
}

export async function paymentListOrders () {
  if (!getApi()) return { code: 0, data: [] }
  return getApi().paymentListOrders()
}

export async function paymentGetOrder (orderId) {
  if (!getApi()) return { code: -1 }
  return getApi().paymentGetOrder(orderId)
}


export async function paymentSimulate (orderId) {
  if (!getApi()) return { code: -1 }
  return getApi().paymentSimulate(orderId)
}

export async function paymentCancel(orderId) {
  if (!getApi()) return { code: -1 }

  return getApi().paymentCancel(orderId)
}


// 鈹€鈹€鈹€ 棣栨杩愯寮曞 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export async function firstRunCheck () {
  if (!getApi()) return { setupDone: false }
  return getApi().firstRunCheck()
}
export function onFirstRunStatus (callback) {
  if (!getApi()) return () => {}
  return getApi().onFirstRunStatus(callback)
}

// 鈹€鈹€鈹€ 閫氱煡 API 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export function showNotification (data) {
  if (!getApi()) return
  return getApi().showNotification(data)
}

