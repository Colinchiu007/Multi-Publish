// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { autoUpdater } = deps

  ipcMain.handle('update:check', async () => {
    try {
      autoUpdater.check()
      return { code: 0, data: true }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('update:download', withSenderCheck(async () => {
    try {
      autoUpdater.download()
      return { code: 0, data: true }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('update:install', withSenderCheck(async () => {
    try {
      autoUpdater.quitAndInstall()
      return { code: 0, data: true }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
