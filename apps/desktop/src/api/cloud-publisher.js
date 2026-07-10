/**
 * 云端发布 API 封装 — 调用 Electron IPC (F13)
 *
 * R52/R56：所有返回值统一 { code, data, message } 格式
 */

var _api = null
function getApi() {
  if (!_api) _api = window.electronAPI || null
  return _api
}

/**
 * 提交云端发布任务
 * @param {Object} params - { videoUrl, platform, title, desc, tags, coverUrl }
 * @returns {Promise<{code: number, data?: Object, message?: string}>}
 */
export async function cloudPublishSubmit (params) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().cloudPublishSubmit(params)
}

/**
 * 获取云端发布任务列表
 * @returns {Promise<{code: number, data?: {items: Array}}>}
 */
export async function cloudPublishListTasks () {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().cloudPublishListTasks()
}

/**
 * 获取单个云端发布任务详情
 * @param {string} taskId
 * @returns {Promise<{code: number, data?: Object}>}
 */
export async function cloudPublishGetTask (taskId) {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().cloudPublishGetTask(taskId)
}

/**
 * 获取支持云端发布的平台列表
 * @returns {Promise<{code: number, data?: Array}>}
 */
export async function cloudPublishPlatforms () {
  if (!getApi()) return { code: -1, message: 'electronAPI not available' }
  return getApi().cloudPublishPlatforms()
}
