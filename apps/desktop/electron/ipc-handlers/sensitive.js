function registerHandlers(ipcMain, deps) {
  const { _sensitiveFilter } = deps

  ipcMain.handle('sensitive:check', async (_, { text }) => {
    try {
      const result = _sensitiveFilter.check(text || '')
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('sensitive:replace', async (_, { text }) => {
    try {
      const result = _sensitiveFilter.replace(text || '')
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })
}

module.exports = registerHandlers
