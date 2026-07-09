// @ts-check
function registerHandlers(ipcMain, deps) {
  const { autoUpdater } = deps

  ipcMain.handle('update:check', async () => {
    try {
      autoUpdater.check()
      return { code: 0 }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('update:download', async () => {
    try {
      autoUpdater.download()
      return { code: 0 }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('update:install', async () => {
    try {
      autoUpdater.quitAndInstall()
      return { code: 0 }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
