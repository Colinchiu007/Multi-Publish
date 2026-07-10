// @ts-check
function registerHandlers(ipcMain, deps) {
  const { scheduler } = deps

  ipcMain.handle('scheduler:create', async (event, { platform, article, publishTime }) => {
    try {
      const entry = scheduler.create({ platform, article, publishTime })
      return { code: 0, data: entry, message: '定时任务已创建' }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('scheduler:list', async () => {
    try { return { code: 0, data: scheduler.list() } } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('scheduler:cancel', async (event, id) => {
    try {
      scheduler.cancel(id)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true, message: '定时任务已取消' }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
