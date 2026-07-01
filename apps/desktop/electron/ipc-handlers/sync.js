function registerHandlers(ipcMain, deps) {
  const { _dataSync } = deps

  ipcMain.handle('sync:all', async () => {
    try {
      const results = await _dataSync.syncAll()
      return { code: 0, data: results }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('sync:platform', async (_, platform) => {
    try {
      const result = await _dataSync.syncPlatform(platform)
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('sync:cached', async () => {
    try {
      const data = _dataSync.getAllCachedData()
      return { code: 0, data }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })
}

module.exports = registerHandlers
