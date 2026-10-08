/**
 * ops-center-sync API 封装 — 运营后台模型配置运行时同步
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 ops-center-sync.js（IPC：get/save/now）。
 * 运营后台配置（限流/模型/能力）经目录端点自动下发到桌面端，前端不再手工填写限流。
 *
 * M-9 收敛：改走 electron-bridge（各调用的 fallback 信封保持旧实现
 * 逐字段一致 —— 含 data/config 缺省形态，调用侧判空逻辑不受影响）。
 */
import { invokeWithFallback, on } from './electron-bridge'

const UNAVAILABLE = 'electronAPI not available'

/** 读取同步配置（URL / 是否已配置 Key / 自动同步 / 上次同步时间；不含明文 Key） */
export function opsCenterSyncGet () {
  return invokeWithFallback('opsCenterSyncGet', { code: -1, message: UNAVAILABLE, config: null })
}

/** 保存同步配置；apiKey 传空表示保留现有 Key（payload 脱壳后过 IPC） */
export function opsCenterSyncSave (payload) {
  return invokeWithFallback('opsCenterSyncSave', { code: -1, message: UNAVAILABLE }, payload)
}

/** 立即从运营后台拉取目录并下发到本地模型配置 */
export function opsCenterSyncNow () {
  return invokeWithFallback('opsCenterSyncNow', { code: -1, message: UNAVAILABLE })
}

/** 读取运行时策略状态（公告 / 版本发布 / 内容安全），不含敏感字段 */
export function opsCenterSyncRuntime () {
  return invokeWithFallback('opsCenterSyncRuntime', { code: -1, message: UNAVAILABLE, data: null })
}

/** 视频创作流水线选项控制（2026-08-31）：运营中心下发的可见性与默认值 */
export function opsCenterSyncPipelineOptions () {
  return invokeWithFallback('opsCenterSyncPipelineOptions', { code: -1, message: UNAVAILABLE, data: null })
}

/**
 * 应用菜单配置（2026-09-15）：运营中心下发「应用菜单哪些路径显示/隐藏/顺序」
 * data 为 null 表示没有下发有效菜单 —— 菜单侧用 fail-open 兜底默认菜单，防止无效配置把菜单整个清空。
 */
export function opsCenterSyncAppMenu () {
  return invokeWithFallback('opsCenterSyncAppMenu', { code: -1, message: UNAVAILABLE, data: null })
}

/**
 * 订阅「运营中心已更新」事件（applyRuntime 成功后广播）。
 * @param {(payload: {syncedAt?: string}) => void} callback
 * @returns {Function} 取消订阅函数；Electron 不可用时返回空操作。
 */
export function onOpsCenterRuntimeUpdated (callback) {
  return on('OpsCenterRuntimeUpdated', callback)
}
