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
    scheduler.cancel(id)
    return { code: 0, message: '定时任务已取消' }
  })
}

module.exports = registerHandlers
