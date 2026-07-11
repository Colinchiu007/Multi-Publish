// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  // eslint-disable-next-line no-unused-vars
  const { app, hotkeys, firstRun, BrowserWindow, log } = deps

  ipcMain.handle('app:get-version', () => {
    try {
      // 直接从 package.json 读取版本号，避免 Electron 开发模式下 app.getVersion() 返回错误值
      const pkg = require('../../../package.json')
      return { code: 0, data: pkg.version || app.getVersion() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('app:get-platform', () => {
    try {
      return { code: 0, data: process.platform }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('hotkeys:list', async () => {
    try {
      return { code: 0, data: hotkeys.getShortcuts() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('first-run:check', async () => {
    try {
      return { code: 0, data: firstRun.checkDeps() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('show-notification', async (_, data) => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('notification', data)
      }
      return { code: 0, data: true }
    // eslint-disable-next-line no-unused-vars
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
