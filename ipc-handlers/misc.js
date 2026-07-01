module.exports = function registerHandlers(ipcMain, deps) {
  const { webviewManager } = deps
  ipcMain.handle('app:get-version', () => require('electron').app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  ipcMain.handle('hotkeys:list', () => [])
  ipcMain.handle('show-notification', (_, data) => { /* notification handled by renderer */ })
  ipcMain.handle('first-run:check', () => ({ isFirstRun: false }))
  ipcMain.handle('history:list', (_, opts) => ({ code: 0, data: [] }))
  ipcMain.handle('history:get', (_, id) => ({ code: 0, data: null }))
  ipcMain.handle('dashboard:stats', () => ({ code: 0, data: {} }))
}
