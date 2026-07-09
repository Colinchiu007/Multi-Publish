// @ts-check
function registerHandlers(ipcMain, deps) {
  const { keywordMonitor } = deps

  ipcMain.handle('keyword:start', async (_, { keyword, opts }) => {
    try {
      const ok = keywordMonitor.startMonitoring(keyword, opts)
      return { code: ok ? 0 : -1, data: { keyword } }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('keyword:stop', async (_, { keyword }) => {
    try {
      const ok = keywordMonitor.stopMonitoring(keyword)
      return { code: ok ? 0 : -1 }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('keyword:status', async () => {
    try {
      return { code: 0, data: keywordMonitor.getStatus() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('keyword:history', async (_, { keyword }) => {
    try {
      return { code: 0, data: keywordMonitor.getHistory(keyword) }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('keyword:stop-all', async () => {
    try {
      keywordMonitor.stopAll()
      return { code: 0 }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
