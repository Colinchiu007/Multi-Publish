module.exports = function registerHandlers(ipcMain, deps) {
  const { keywordMonitor } = deps
  ipcMain.handle('keyword:start', (_, { keyword, opts }) => keywordMonitor.start(keyword, opts))
  ipcMain.handle('keyword:stop', (_, { keyword }) => keywordMonitor.stop(keyword))
  ipcMain.handle('keyword:status', () => keywordMonitor.status())
  ipcMain.handle('keyword:history', (_, { keyword }) => keywordMonitor.history(keyword))
  ipcMain.handle('keyword:stop-all', () => keywordMonitor.stopAll())
}
