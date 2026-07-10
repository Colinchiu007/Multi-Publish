// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { scheduler } = deps

  ipcMain.handle('scheduler:create', async (event, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, article, publishTime } = arg
      const entry = scheduler.create({ platform, article, publishTime })
      return { code: 0, data: entry, message: '定时任务已创建' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('scheduler:list', async () => {
    try { return { code: 0, data: scheduler.list() } } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('scheduler:cancel', async (event, id) => {
    try {
      scheduler.cancel(id)
      return { code: 0, data: true, message: '定时任务已取消' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
