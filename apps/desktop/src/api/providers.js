/**
 * Provider API 封装 — 调用 Electron IPC
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 provider-manager.js
 * 对应 orchestrator 的 /api/admin/providers* 和 /api/user/providers* 端点
 *
 * M-9 收敛：全部走 electron-bridge 的 invokeWithFallback（理由同
 * model-providers.js 头注 —— providerCreate/providerSetUserKey 携带
 * API Key，必须经 toPlainIpcValue 脱壳后过 IPC）。
 */
import { invokeWithFallback } from './electron-bridge'

const UNAVAILABLE = 'electronAPI not available'

// ─── Admin CRUD ────────────────────────────────

/** 列出所有 Provider */
export function providerList () {
  return invokeWithFallback('providerList', { code: -1, message: UNAVAILABLE, data: [] })
}

/** 创建 Provider（data 含 API Key，脱壳后过 IPC） */
export function providerCreate (data) {
  return invokeWithFallback('providerCreate', { code: -1, message: UNAVAILABLE }, data)
}

/** 更新 Provider */
export function providerUpdate (name, data) {
  return invokeWithFallback('providerUpdate', { code: -1, message: UNAVAILABLE }, name, data)
}

/** 删除 Provider */
export function providerDelete (name) {
  return invokeWithFallback('providerDelete', { code: -1, message: UNAVAILABLE }, name)
}

/** 测试连接 */
export function providerTest (name) {
  return invokeWithFallback('providerTest', { code: -1, message: UNAVAILABLE }, name)
}

// ─── User API ──────────────────────────────────

/** 列出可用 Provider */
export function providerListUser () {
  return invokeWithFallback('providerListUser', { code: -1, message: UNAVAILABLE, data: [] })
}

/** 设置用户 API Key 覆盖（apiKey 经脱壳后过 IPC） */
export function providerSetUserKey (name, apiKey, baseUrl) {
  return invokeWithFallback('providerSetUserKey', { code: -1, message: UNAVAILABLE }, name, apiKey, baseUrl)
}

/** 移除用户 API Key 覆盖 */
export function providerDeleteUserKey (name) {
  return invokeWithFallback('providerDeleteUserKey', { code: -1, message: UNAVAILABLE }, name)
}
