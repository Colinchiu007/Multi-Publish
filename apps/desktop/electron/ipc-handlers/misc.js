// @ts-check
function registerHandlers(ipcMain, deps) {
  // eslint-disable-next-line no-unused-vars
  const { app, hotkeys, firstRun, BrowserWindow, log } = deps

  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)

  ipcMain.handle('hotkeys:list', async () => {
    return { code: 0, data: hotkeys.getShortcuts() }
  })

  ipcMain.handle('first-run:check', async () => {
    return { code: 0, data: firstRun.checkDeps() }
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
