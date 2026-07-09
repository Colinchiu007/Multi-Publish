// @ts-check
function registerHandlers(ipcMain, deps) {
  // eslint-disable-next-line no-unused-vars
  const { app, hotkeys, firstRun, BrowserWindow, log } = deps

  ipcMain.handle('app:get-version', () => {
    try {
      return app.getVersion()
    } catch (e) { return { code: -1, message: e.message } }
  })
  ipcMain.handle('app:get-platform', () => {
    try {
      return process.platform
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('hotkeys:list', async () => {
    try {
      return { code: 0, data: hotkeys.getShortcuts() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('first-run:check', async () => {
    try {
      return { code: 0, data: firstRun.checkDeps() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('show-notification', async (_, data) => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('notification', data)
      }
    // eslint-disable-next-line no-unused-vars
    } catch (e) { /* ignore */ }
  })
}

module.exports = registerHandlers
