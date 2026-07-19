// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { _dataSync } = deps

  ipcMain.handle('sync:all', withSenderCheck(async () => {
    try {
      const results = await _dataSync.syncAll()
      return { code: 0, data: results }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('sync:platform', withSenderCheck(async (_, platform) => {
    try {
      const result = await _dataSync.syncPlatform(platform)
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('sync:cached', async () => {
    try {
      const data = _dataSync.getAllCachedData()
      return { code: 0, data }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })
}

module.exports = registerHandlers
