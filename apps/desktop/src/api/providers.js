/**
 * Provider API 封装 — 调用 Electron IPC
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 provider-manager.js
 * 对应 orchestrator 的 /api/admin/providers* 和 /api/user/providers* 端点
 */

function getApi () {
  return window.electronAPI || null
}

// ─── Admin CRUD ────────────────────────────────

/** 列出所有 Provider */
export async function providerList () {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: [] }
  return api.providerList()
}

/** 创建 Provider */
export async function providerCreate (data) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerCreate(data)
}

/** 更新 Provider */
export async function providerUpdate (name, data) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerUpdate(name, data)
}

/** 删除 Provider */
export async function providerDelete (name) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerDelete(name)
}

/** 测试连接 */
export async function providerTest (name) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerTest(name)
}

// ─── User API ──────────────────────────────────

/** 列出可用 Provider */
export async function providerListUser () {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available', data: [] }
  return api.providerListUser()
}

/** 设置用户 API Key 覆盖 */
export async function providerSetUserKey (name, apiKey, baseUrl) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerSetUserKey(name, apiKey, baseUrl)
}

/** 移除用户 API Key 覆盖 */
export async function providerDeleteUserKey (name) {
  const api = getApi()
  if (!api) return { code: -1, message: 'electronAPI not available' }
  return api.providerDeleteUserKey(name)
}
