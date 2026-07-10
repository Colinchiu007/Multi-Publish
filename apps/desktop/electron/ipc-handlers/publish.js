// @ts-check
/**
 * 发布 & 队列 & 历史 IPC handlers
 * publish:wechat → 微信发布
 * publish:batch → 批量发布
 * queue:status / queue:history / queue:cancel → 任务队列
 * history:list / history:get → 发布历史
 * dashboard:stats → 发布统计
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  // eslint-disable-next-line no-unused-vars
  const { taskQueue, history, BrowserWindow, log } = deps

  ipcMain.handle('publish:wechat', async (event, articleData) => {
    try {
      const offlineManager = require('../services/offline-manager')
      if (offlineManager.isOffline()) {
        offlineManager.addToCache({ platform: 'wechat_mp', article: articleData, accountId: null })
        return { code: 0, data: { cached: true }, message: '网络离线，任务已缓存，恢复后自动发布' }
      }
      const taskId = taskQueue.add({
        platform: 'wechat_mp',
        article: articleData,
        retry: 2,
        timeout: 180000,
      })
      return { code: 0, data: { taskId }, message: '任务已加入队列' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('publish:batch', async (event, { platforms, article }) => {
    try {
    // M-5 修复：参数校验，platforms 为 undefined 时 .map() 必崩
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return { code: EC.VALIDATION_ERROR, message: 'platforms 不能为空且必须为数组' }
    }
    const isObj = platforms && platforms.length > 0 && typeof platforms[0] === 'object'
    const taskIds = platforms.map(p => {
      const platform = isObj ? p.platform : p
      const accountId = isObj ? p.accountId : null
      return taskQueue.add({
        platform,
        article: { ...(article || {}), accountId },
        accountId,
      })
    })
      return { code: 0, data: { taskIds }, message: taskIds.length + " tasks added" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('queue:status', async () => {
    try {
      // M-13 修复：成功路径也包裹为标准格式，与错误路径对称
      return { code: 0, data: taskQueue.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('queue:history', async () => {
    try {
      return { code: 0, data: taskQueue.getHistory() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })
  ipcMain.handle('queue:cancel', async (event, taskId) => {
    try {
      const ok = taskQueue.cancel(taskId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.NOT_FOUND, data: ok, message: ok ? '任务已取消' : '任务不存在或已完成' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('history:list', async (event, opts) => {
    try {
      const result = history.listRecords(opts)
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, records: [] } }
    }
  })

  ipcMain.handle('history:get', async (event, id) => {
    try {
      const record = history.getRecord(id)
      if (!record) return { code: EC.NOT_FOUND, message: '记录不存在' }
      return { code: 0, data: record }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('dashboard:stats', async () => {
    try {
      return { code: 0, data: history.getStats() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
