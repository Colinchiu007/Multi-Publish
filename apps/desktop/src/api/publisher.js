/**
 * 发布 API 封装 — 调用 Electron IPC
 * 所有 Vue 组件通过此文件访问 Electron IPC，不直接调用 window.electronAPI
 */
import { invoke, invokeWithFallback, on as bridgeOn } from "./electron-bridge";

// ─── 发布 API ─────────────────────────────
export async function publishWechat(article) { return invoke("publishWechat", article) }

export async function publishBatch(platforms, article) { return invokeWithFallback("publishBatch", {  code: -1, message: 'electronAPI not available'  }, platforms, article) }

export function onProgress(callback) { return bridgeOn("Progress", callback) }

// ─── 队列 API ─────────────────────────────
export async function getQueueStatus () {
  return invokeWithFallback("getQueueStatus", {})
}

export async function getQueueHistory() { return invokeWithFallback("getQueueHistory", {  code: 0, data: []  }) }

export async function cancelTask(taskId) { return invokeWithFallback("cancelTask", {  code: -1  }, taskId) }

// ─── 发布历史 API ─────────────────────────
export async function historyList (opts) {
  return invokeWithFallback("historyList", { code: 0, data: { total: 0, records: [] } }, opts)
}

export async function historyGet(id) { return invokeWithFallback("historyGet", {  code: -1, message: 'electronAPI not available'  }, id) }

// ─── 发布统计 API ──────────────────────────
export async function dashboardStats () {
  return invokeWithFallback("dashboardStats", { code: 0, data: { total: 0, success: 0, failed: 0, byPlatform: {}, daily: [] } })
}

// ─── 定时发布 API ─────────────────────────
export async function schedulerCreate(schedule) { return invokeWithFallback("schedulerCreate", {  code: -1  }, schedule) }

export async function schedulerList() { return invokeWithFallback("schedulerList", {  code: 0, data: []  }) }

export async function schedulerCancel(id) { return invokeWithFallback("schedulerCancel", {  code: -1  }, id) }

// ─── 账号管理 API ─────────────────────────
export async function listAccounts() { return invokeWithFallback("listAccounts", {  code: 0, data: []  }) }

export async function accountAdd(platform) { return invokeWithFallback("accountAdd", {  code: -1, message: 'electronAPI not available'  }, platform) }

export async function accountDelete(accountId) { return invokeWithFallback("accountDelete", {  code: -1, message: 'electronAPI not available'  }, accountId) }

export async function accountCheckLogin(platform, accountId) { return invokeWithFallback("accountCheckLogin", {  code: -1, message: 'electronAPI not available'  }, platform, accountId) }

export async function accountList() { return invokeWithFallback("accountList", {  code: 0, data: []  }) }

export async function accountSetDefault(platform, accountId) { return invoke("accountSetDefault", platform, accountId) }

export async function accountUpdate (id, fields) {
  return invoke("accountUpdate", id, fields)
}

// ─── 内嵌浏览器登录 API ──────────────────
export async function authOpenLogin(platform) { return invokeWithFallback("authOpenLogin", {  code: -1  }, platform) }

export async function authClose () {
  return invoke("authClose")
}

export function onAuthViewOpened(callback) { return bridgeOn("AuthViewOpened", callback) }

export function onAuthCompleted(callback) { return bridgeOn("AuthCompleted", callback) }

export function onAuthViewClosed(callback) { return bridgeOn("AuthViewClosed", callback) }

// ─── 渲染 API ────────────────────────────
export async function renderStart(data) { return invoke("renderStart", data) }

export async function renderCancel () {
  return invokeWithFallback("renderCancel", {})
}

export async function renderGetStatus () {
  return invokeWithFallback("renderGetStatus", {})
}

export async function renderInstallDeps() { return invokeWithFallback("renderInstallDeps", {  code: -1, message: 'electronAPI not available'  }) }

export function onRenderProgress(callback) { return bridgeOn("RenderProgress", callback) }

export function onRenderComplete(callback) { return bridgeOn("RenderComplete", callback) }

export function onRenderError(callback) { return bridgeOn("RenderError", callback) }

export function onRenderInstallProgress(callback) { return bridgeOn("RenderInstallProgress", callback) }

// ─── 内容情报 API ────────────────────────
export async function intelligenceSearch(query, opts) { return invokeWithFallback("intelligenceSearch", {  code: 0, data: []  }, query, opts) }

export async function intelligenceSearchTitles (query, opts) {
  return invokeWithFallback("intelligenceSearchTitles", [], query, opts)
}

export async function intelligenceFetchTrending (opts) {
  const res = await invokeWithFallback("intelligenceFetchTrending", [], opts)
  // 拆 envelope：IPC 返回 { code, data }
  const payload = res?.code === 0 ? res.data : res
  // 归一化：后端 fetchTrending 返回 { total, results, bySource, timestamp }（results 元素字段为 engagement），
  // 前端组件契约为数组且字段为 engagementScore。统一映射，避免字段名/结构不匹配导致互动分永不显示。
  if (Array.isArray(payload)) {
    return payload.map(item => ({ ...item, engagementScore: item.engagementScore != null ? item.engagementScore : item.engagement }))
  }
  if (payload && Array.isArray(payload.results)) {
    return payload.results.map(item => ({ ...item, engagementScore: item.engagementScore != null ? item.engagementScore : item.engagement }))
  }
  return payload
}

export async function intelligenceSuggestTags (content, opts) {
  return invokeWithFallback("intelligenceSuggestTags", null, content, opts)
}

export async function intelligenceFindReferences (url, opts) {
  return invokeWithFallback("intelligenceFindReferences", [], url, opts)
}

export async function intelligenceGetOptimalTime (keyword) {
  return invokeWithFallback("intelligenceGetOptimalTime", null, keyword)
}

export async function intelligenceGetBenchmark (opts) {
  return invokeWithFallback("intelligenceGetBenchmark", null, opts)
}

// ─── 关键词监测 API ──────────────────────
export async function keywordStatus () {
  return invokeWithFallback("keywordStatus", { code: 0, data: {} })
}

export async function keywordStart(keyword, opts) { return invokeWithFallback("keywordStart", {  code: -1  }, keyword, opts) }

export async function keywordStop(keyword) { return invokeWithFallback("keywordStop", {  code: -1  }, keyword) }

export async function keywordHistory(keyword) { return invokeWithFallback("keywordHistory", {  code: 0, data: []  }, keyword) }

// ─── 爆款分析 API ────────────────────────
export async function viralAnalyze(articles, topic) { return invokeWithFallback("viralAnalyze", {  code: -1  }, articles, topic) }
export async function viralGenerate(opts) { return invokeWithFallback("viralGenerate", {  code: -1  }, opts) }
export async function viralTrending(articles) { return invokeWithFallback("viralTrending", {  code: -1  }, articles) }

// ─── 平台配置 API ────────────────────────
export async function platformList() { return invokeWithFallback("platformList", {  code: 0, data: []  }) }

export async function platformGet(id) { return invokeWithFallback("platformGet", {  code: -1  }, id) }

export async function getPlatformDefinitions() { return invokeWithFallback("getPlatformDefinitions", {  code: -1  }) }

// ─── 敏感词 API ──────────────────────────
export async function sensitiveCheck(text) { return invokeWithFallback("sensitiveCheck", {  code: -1  }, text) }

export async function sensitiveReplace(text) { return invokeWithFallback("sensitiveReplace", {  code: -1  }, text) }

// ─── 数据同步 API ────────────────────────
export async function syncAll() { return invokeWithFallback("syncAll", {  code: -1  }) }

export async function syncPlatform(platform) { return invokeWithFallback("syncPlatform", {  code: -1  }, platform) }

// ─── 自动更新 API ──────────────────────────
export async function updateCheck () {
  return invokeWithFallback("updateCheck", {})
}
export async function updateDownload () {
  return invokeWithFallback("updateDownload", {})
}
export async function updateInstall () {
  return invokeWithFallback("updateInstall", {})
}
export function onUpdateStatus(callback) { return bridgeOn("UpdateStatus", callback) }


// ─── 草稿箱 API（蚁小二复用）─────────────────
export async function draftSave(draft) { return invokeWithFallback("draftSave", { code: -1, message: 'electronAPI not available' }, draft) }

export async function draftList() { return invokeWithFallback("draftList", { code: 0, data: [] }) }

export async function draftDelete(draftId) { return invokeWithFallback("draftDelete", { code: -1, message: 'electronAPI not available' }, draftId) }

// ─── 全局存储 API ─────────────────────────
export async function storeGetSetting (key) {
  const result = await invokeWithFallback("storeGetSetting", null, key)
  if (result && typeof result === 'object' && typeof result.code === 'number') {
    return result.code === 0 ? result.data : null
  }
  return result
}

export async function storeSetSetting (key, value) {
  return invoke("storeSetSetting", key, value)
}

export async function storeAddPublishRecord (record) {
  return invokeWithFallback("storeAddPublishRecord", null, record)
}

export async function storeListPublishHistory(opts) { return invokeWithFallback("storeListPublishHistory", {  code: 0, data: []  }, opts) }

// ─── OAuth API ────────────────────────────
export async function oauthStart(opts) { return invokeWithFallback("oauthStart", {  code: -1  }, opts) }

export async function oauthClose () {
  return invoke("oauthClose")
}

export function onOAuthCompleted(callback) { return bridgeOn("OAuthCompleted", callback) }

// ─── 批量发布 API ─────────────────────────
export async function batchCreate(batch) { return invokeWithFallback("batchCreate", {  code: -1  }, batch) }

export async function batchList() { return invokeWithFallback("batchList", {  code: 0, data: []  }) }

export async function batchDelete(id) { return invoke("batchDelete", id) }

export function onBatchProgress(callback) { return bridgeOn("BatchProgress", callback) }

// ─── 支付 API ─────────────────────────────
export async function paymentCreateOrder(options) { return invokeWithFallback("paymentCreateOrder", {  code: -1  }, options) }

export async function paymentListOrders() { return invokeWithFallback("paymentListOrders", {  code: 0, data: []  }) }

export async function paymentGetOrder(orderId) { return invokeWithFallback("paymentGetOrder", {  code: -1  }, orderId) }

export async function paymentSimulate(orderId) { return invokeWithFallback("paymentSimulate", {  code: -1  }, orderId) }

export async function paymentCancel(orderId) { return invokeWithFallback("paymentCancel", {  code: -1  }, orderId) }


// ─── 首次运行引导 API ──────────────────────
export async function firstRunCheck() { return invokeWithFallback("firstRunCheck", {  code: 0, data: { setupDone: false }  }) }
export function onFirstRunStatus(callback) { return bridgeOn("FirstRunStatus", callback) }

// ─── 通知 API ────────────────────────────

// ──── Offline API ──────────────────────────────────────────────
export async function offlineStatus () {
  return invokeWithFallback("offlineStatus", { code: -1, data: { offline: false, cachedCount: 0, cachedTasks: [] } })
}

export async function offlineAddToCache(task) { return invokeWithFallback("offlineAddToCache", {  code: -1  }, task) }

export async function offlineClearCache() { return invokeWithFallback("offlineClearCache", {  code: -1  }) }

export function onOfflineRestored(callback) { return bridgeOn("OfflineRestored", callback) }

export function showNotification (data) {
  return invoke("showNotification", data)
}


// ─── Pipeline 流水线 API ──────────────────────
export async function pipelineList() { return invokeWithFallback("pipelineList", { code: 0, data: [] }) }
export async function pipelineGet(name) { return invokeWithFallback("pipelineGet", null, name) }
export async function pipelineStart(name, params) { return invokeWithFallback("pipelineStart", { code: -1, message: 'electronAPI not available' }, name, params) }
export async function pipelinePause() { return invokeWithFallback("pipelinePause", { code: -1 }) }
export async function pipelineResume() { return invokeWithFallback("pipelineResume", { code: -1 }) }
export async function pipelineCancel() { return invokeWithFallback("pipelineCancel", { code: -1 }) }
export async function pipelineStatus(name) { return invokeWithFallback("pipelineStatus", null, name) }
export async function pipelineAdvance() { return invokeWithFallback("pipelineAdvance", { code: -1 }) }
export async function pipelineHistory() { return invokeWithFallback("pipelineHistory", { code: 0, data: [] }) }

// ═══ Pipeline 编排模式 API（story2video-compose 等新流水线使用） ═══
export async function pipelineStartOrchestrated(name, params) { return invokeWithFallback("pipelineStartOrchestrated", { code: -1, message: 'electronAPI not available' }, name, params) }
export async function pipelineExecuteStage(runId) { return invokeWithFallback("pipelineExecuteStage", { code: -1 }, runId) }
export async function pipelineAdvanceToNextCheckpoint(runId) { return invokeWithFallback("pipelineAdvanceToNextCheckpoint", { code: -1 }, runId) }
export async function pipelineGetRunContext(runId) { return invokeWithFallback("pipelineGetRunContext", null, runId) }
export async function pipelinePauseWithCheckpoint() { return invokeWithFallback("pipelinePauseWithCheckpoint", { code: -1 }) }
export async function pipelineResumeFromCheckpoint() { return invokeWithFallback("pipelineResumeFromCheckpoint", { code: -1 }) }
export async function pipelineRegisterPipeline(def) { return invokeWithFallback("pipelineRegisterPipeline", { code: -1 }, def) }

