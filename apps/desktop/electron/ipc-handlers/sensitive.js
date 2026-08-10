// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')

  // 敏感词过滤器：优先使用 OpsCenterSync 的「内置 + 运营后台远程词库」组合；
  // 未接入同步服务时回退 phase1 注入的内置过滤器。
  function resolveFilter () {
    if (deps.opsCenterSync && typeof deps.opsCenterSync.getSensitiveFilter === 'function') {
      const remote = deps.opsCenterSync.getSensitiveFilter()
      if (remote) {
        const replacement = (typeof deps.opsCenterSync.getReplacement === 'function')
          ? deps.opsCenterSync.getReplacement()
          : '***'
        return {
          check: (t) => remote.check(t),
          replace: (t) => remote.replace(t, replacement),
        }
      }
    }
    return deps._sensitiveFilter || {
      check: () => ({ hasSensitive: false, words: [], positions: [] }),
      replace: (t) => t,
    }
  }

  ipcMain.handle('sensitive:check', async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { text } = arg
      const result = resolveFilter().check(text || '')
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
      const result = resolveFilter().replace(text || '')
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))
}

module.exports = registerHandlers
