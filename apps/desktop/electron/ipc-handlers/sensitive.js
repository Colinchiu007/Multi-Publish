// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { _sensitiveFilter } = deps

  ipcMain.handle('sensitive:check', async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { text } = arg
      const result = _sensitiveFilter.check(text || '')
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('sensitive:replace', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { text } = arg
      const result = _sensitiveFilter.replace(text || '')
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))
}

module.exports = registerHandlers
