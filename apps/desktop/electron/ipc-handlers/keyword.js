// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { keywordMonitor } = deps

  ipcMain.handle('keyword:start', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { keyword, opts } = arg
      const ok = keywordMonitor.startMonitoring(keyword, opts)
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: { keyword } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('keyword:stop', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { keyword } = arg
      const ok = keywordMonitor.stopMonitoring(keyword)
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('keyword:status', async () => {
    try {
      return { code: 0, data: keywordMonitor.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('keyword:history', async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { keyword } = arg
      return { code: 0, data: keywordMonitor.getHistory(keyword) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('keyword:stop-all', withSenderCheck(async () => {
    try {
      keywordMonitor.stopAll()
      return { code: 0, data: true }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
