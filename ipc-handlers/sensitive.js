module.exports = function registerHandlers(ipcMain, deps) {
  const { sensitiveFilter } = deps
  ipcMain.handle('sensitive:check', (_, { text }) => sensitiveFilter.check(text))
  ipcMain.handle('sensitive:replace', (_, { text }) => sensitiveFilter.replace(text))
}
