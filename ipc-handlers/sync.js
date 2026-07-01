module.exports = function registerHandlers(ipcMain, deps) {
  const { dataSyncService } = deps
  ipcMain.handle('sync:all', () => dataSyncService.syncAll())
  ipcMain.handle('sync:platform', (_, platform) => dataSyncService.syncPlatform(platform))
  ipcMain.handle('sync:cached', () => dataSyncService.getCached())
}
