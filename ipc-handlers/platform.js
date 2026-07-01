module.exports = function registerHandlers(ipcMain, deps) {
  const { platformConfig } = deps
  ipcMain.handle('platform:list', () => platformConfig.list())
  ipcMain.handle('platform:get', (_, id) => platformConfig.get(id))
}
