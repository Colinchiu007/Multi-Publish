/**
 * Model Provider API 封装 — 调用 Electron IPC
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 model-provider-manager.js
 * 7 类模型：llm / tts / speech_recognition / image / video / audio / multimodal
 *
 * M-9 收敛：不再自持 getApi 副本、不再 api.X(data) 直调 —— 全部走
 * electron-bridge 的 invokeWithFallback，获得两个此前没有的保证：
 *   1. 参数经 toPlainIpcValue 脱壳。服务商配置**含 API Key**，原先
 *      reactive proxy 原样过 IPC，有序列化与对象泄漏风险；
 *   2. preload 缺方法 / window.electronAPI 缺失时统一走 fallback
 *      （code: -1 信封），而不是 undefined 引发的调用侧 TypeError。
 *
 * fallback 形态保持与旧实现的「electronAPI not available」信封兼容
 * （调用侧 useModelProviderCrud 只判 res.code / res.data）。
 */
import { invokeWithFallback } from './electron-bridge'

const UNAVAILABLE = 'electronAPI not available'

/** 列出服务商（可按类别过滤） */
export function modelProviderList (category) {
  return invokeWithFallback('modelProviderList', { code: -1, message: UNAVAILABLE, data: [] }, category)
}

/** 获取单个服务商 */
export function modelProviderGet (id) {
  return invokeWithFallback('modelProviderGet', { code: -1, message: UNAVAILABLE }, id)
}

/** 创建服务商（data 含 API Key，脱壳后过 IPC） */
export function modelProviderCreate (data) {
  return invokeWithFallback('modelProviderCreate', { code: -1, message: UNAVAILABLE }, data)
}

/** 更新服务商（updates 含 API Key，脱壳后过 IPC） */
export function modelProviderUpdate (id, updates) {
  return invokeWithFallback('modelProviderUpdate', { code: -1, message: UNAVAILABLE }, id, updates)
}

/** 删除服务商 */
export function modelProviderDelete (id) {
  return invokeWithFallback('modelProviderDelete', { code: -1, message: UNAVAILABLE }, id)
}

// ─── 默认设置 ──────────────────────────────────

/** 设置某类别的默认服务商 */
export function modelProviderSetDefault (category, providerId) {
  return invokeWithFallback('modelProviderSetDefault', { code: -1, message: UNAVAILABLE }, category, providerId)
}

/** 设置多模态模型的能力默认 */
export function modelProviderSetCapabilityDefault (providerId, capability, enabled) {
  return invokeWithFallback('modelProviderSetCapabilityDefault', { code: -1, message: UNAVAILABLE }, providerId, capability, enabled)
}

/** 获取某类别的默认服务商 */
export function modelProviderGetDefault (category) {
  return invokeWithFallback('modelProviderGetDefault', { code: -1, message: UNAVAILABLE, data: null }, category)
}

// ─── 辅助 ──────────────────────────────────────

/** 测试连接 */
export function modelProviderTest (id) {
  return invokeWithFallback('modelProviderTest', { code: -1, message: UNAVAILABLE }, id)
}

/** 获取某类别可新增的预设列表 */
export function modelProviderPresets (category) {
  return invokeWithFallback('modelProviderPresets', { code: -1, message: UNAVAILABLE, data: [] }, category)
}

/** 检查某类别是否已配置（有 API Key） */
export function modelProviderIsConfigured (category) {
  return invokeWithFallback('modelProviderIsConfigured', { code: -1, message: UNAVAILABLE, data: false }, category)
}
