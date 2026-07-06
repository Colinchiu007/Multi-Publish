// @ts-check
function registerHandlers(ipcMain, deps) {
  const { autoUpdater } = deps

  ipcMain.handle('update:check', async () => {
    autoUpdater.check()
    return { code: 0 }
  })

  ipcMain.handle('update:download', async () => {
    autoUpdater.download()
    return { code: 0 }
  })

  ipcMain.handle('update:install', async () => {
    autoUpdater.quitAndInstall()
    return { code: 0 }
  })
}

module.exports = registerHandlers
