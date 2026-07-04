/**
 * 发布 & 队列 & 历史 IPC handlers
 * publish:wechat → 微信发布
 * publish:batch → 批量发布
 * queue:status / queue:history / queue:cancel → 任务队列
 * history:list / history:get → 发布历史
 * dashboard:stats → 发布统计
 */

function registerHandlers(ipcMain, deps) {
  var EC = require('../error-codes').ERROR
  const { taskQueue, history, BrowserWindow, log } = deps

  ipcMain.handle('publish:wechat', async (event, articleData) => {
    try {
      const offlineManager = require('../offline-manager')
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
    return { code: 0, data: { taskIds }, message: `已添加 ${taskIds.length} 个任务` }
  })

  ipcMain.handle('queue:status', async () => taskQueue.getStatus())
  ipcMain.handle('queue:history', async () => ({ code: 0, data: taskQueue.getHistory() }))
  ipcMain.handle('queue:cancel', async (event, taskId) => {
    const ok = taskQueue.cancel(taskId)
    return { code: ok ? 0 : -1, message: ok ? '任务已取消' : '任务不存在或已完成' }
  })

  ipcMain.handle('history:list', async (event, opts) => {
    try {
      const result = history.listRecords(opts)
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e.message, data: { total: 0, records: [] } }
    }
  })

  ipcMain.handle('history:get', async (event, id) => {
    const record = history.getRecord(id)
    if (!record) return { code: -1, message: '记录不存在' }
    return { code: 0, data: record }
  })

  ipcMain.handle('dashboard:stats', async () => {
    return { code: 0, data: history.getStats() }
  })
}

module.exports = registerHandlers
