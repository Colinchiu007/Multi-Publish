module.exports = function registerHandlers(ipcMain, deps) {
  const { autoUpdater } = deps
  ipcMain.handle('update:check', () => autoUpdater.check())
  ipcMain.handle('update:download', () => autoUpdater.download())
  ipcMain.handle('update:install', () => autoUpdater.install())
}
