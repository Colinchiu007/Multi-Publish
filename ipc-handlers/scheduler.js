module.exports = function registerHandlers(ipcMain, deps) {
  const { scheduler } = deps
  ipcMain.handle('scheduler:create', (_, { platform, article, publishTime }) => scheduler.create(platform, article, publishTime))
  ipcMain.handle('scheduler:list', () => scheduler.list())
  ipcMain.handle('scheduler:cancel', (_, id) => scheduler.cancel(id))
}
