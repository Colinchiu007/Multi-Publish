/**
 * 云端发布 API 封装 — 调用 Electron IPC (F13)
 *
 * R52/R56：所有返回值统一 { code, data, message } 格式
 *
 * M-9 收敛：删掉本地 `_api` 缓存副本（它还会把「preload 晚注入」的场景
 * 永久缓存成 null），改走 electron-bridge 的 invokeWithFallback ——
 * 每次调用实时取暴露面，且参数统一脱壳。
 */
import { invokeWithFallback } from './electron-bridge'

const UNAVAILABLE = 'electronAPI not available'

/**
 * 提交云端发布任务
 * @param {Object} params - { videoUrl, platform, title, desc, tags, coverUrl }
 * @returns {Promise<{code: number, data?: Object, message?: string}>}
 */
export function cloudPublishSubmit (params) {
  return invokeWithFallback('cloudPublishSubmit', { code: -1, message: UNAVAILABLE }, params)
}

/**
 * 获取云端发布任务列表
 * @returns {Promise<{code: number, data?: {items: Array}}>}
 */
export function cloudPublishListTasks () {
  return invokeWithFallback('cloudPublishListTasks', { code: -1, message: UNAVAILABLE })
}

/**
 * 获取单个云端发布任务详情
 * @param {string} taskId
 * @returns {Promise<{code: number, data?: Object}>}
 */
export function cloudPublishGetTask (taskId) {
  return invokeWithFallback('cloudPublishGetTask', { code: -1, message: UNAVAILABLE }, taskId)
}

/**
 * 获取支持云端发布的平台列表
 * @returns {Promise<{code: number, data?: Array}>}
 */
export function cloudPublishPlatforms () {
  return invokeWithFallback('cloudPublishPlatforms', { code: -1, message: UNAVAILABLE })
}
