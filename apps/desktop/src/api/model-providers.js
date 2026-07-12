/**
 * Model Provider API 封装 — 调用 Electron IPC
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 model-provider-manager.js
 * 5 类模型：llm / tts / speech_recognition / image / video
 */

function getApi () {
  return window.electronAPI || null
}

// ─── CRUD ──────────────────────────────────────

/** 列出服务商（可按类别过滤） */
export async function modelProviderList (category) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: [] }
  return api.modelProviderList(category)
}

/** 获取单个服务商 */
export async function modelProviderGet (id) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderGet(id)
}

/** 创建服务商 */
export async function modelProviderCreate (data) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderCreate(data)
}

/** 更新服务商 */
export async function modelProviderUpdate (id, updates) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderUpdate(id, updates)
}

/** 删除服务商 */
export async function modelProviderDelete (id) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderDelete(id)
}

// ─── 默认设置 ──────────────────────────────────

/** 设置某类别的默认服务商 */
export async function modelProviderSetDefault (category, providerId) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderSetDefault(category, providerId)
}

/** 获取某类别的默认服务商 */
export async function modelProviderGetDefault (category) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: null }
  return api.modelProviderGetDefault(category)
}

// ─── 辅助 ──────────────────────────────────────

/** 测试连接 */
export async function modelProviderTest (id) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.modelProviderTest(id)
}

/** 获取某类别可新增的预设列表 */
export async function modelProviderPresets (category) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: [] }
  return api.modelProviderPresets(category)
}

/** 检查某类别是否已配置（有 API Key） */
export async function modelProviderIsConfigured (category) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: false }
  return api.modelProviderIsConfigured(category)
}
