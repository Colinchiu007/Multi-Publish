function registerHandlers(ipcMain, deps) {
  const { keywordMonitor } = deps

  ipcMain.handle('keyword:start', async (_, { keyword, opts }) => {
    const ok = keywordMonitor.startMonitoring(keyword, opts)
    return { code: ok ? 0 : -1, data: { keyword } }
  })

  ipcMain.handle('keyword:stop', async (_, { keyword }) => {
    const ok = keywordMonitor.stopMonitoring(keyword)
    return { code: ok ? 0 : -1 }
  })

  ipcMain.handle('keyword:status', async () => {
    return { code: 0, data: keywordMonitor.getStatus() }
  })

  ipcMain.handle('keyword:history', async (_, { keyword }) => {
    return { code: 0, data: keywordMonitor.getHistory(keyword) }
  })

  ipcMain.handle('keyword:stop-all', async () => {
    keywordMonitor.stopAll()
    return { code: 0 }
  })
}

module.exports = registerHandlers
