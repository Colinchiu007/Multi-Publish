/**
 * ops-center-sync API 封装 — 运营后台模型配置运行时同步
 *
 * 桥接 Vue 组件 ↔ Electron 主进程 ops-center-sync.js（IPC：get/save/now）。
 * 运营后台配置（限流/模型/能力）经目录端点自动下发到桌面端，前端不再手工填写限流。
 */
function getApi () {
  return window.electronAPI || null
}

/** 读取同步配置（URL / 是否已配置 Key / 自动同步 / 上次同步时间；不含明文 Key） */
export async function opsCenterSyncGet () {
  const api = getApi()
  if (!api || !api.opsCenterSyncGet) return { code: -1, message: 'electronAPI not available', config: null }
  return api.opsCenterSyncGet()
}

/** 保存同步配置；apiKey 传空表示保留现有 Key */
export async function opsCenterSyncSave (payload) {
  const api = getApi()
  if (!api || !api.opsCenterSyncSave) return { code: -1, message: 'electronAPI not available' }
  return api.opsCenterSyncSave(payload)
}

/** 立即从运营后台拉取目录并下发到本地模型配置 */
export async function opsCenterSyncNow () {
  const api = getApi()
  if (!api || !api.opsCenterSyncNow) return { code: -1, message: 'electronAPI not available' }
  return api.opsCenterSyncNow()
}
