// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { analyticsService, store } = deps

  ipcMain.handle('analytics:overview', async () => {
    try {
      const platforms = analyticsService.getRegisteredPlatforms()
      if (platforms.length === 0) return { code: 0, data: [] }
      const credentialsMap = {}
      for (const p of platforms) {
        const account = store.listAccounts(p)[0]
        if (account?.cookies) {
          try { credentialsMap[p] = { cookies: JSON.parse(account.cookies) } }
          catch (e) { credentialsMap[p] = {} } // eslint-disable-line no-unused-vars
        }
      }
      const data = await analyticsService.fetchOverview(platforms, credentialsMap)
      return { code: 0, data }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('analytics:platform', async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform } = arg
      const account = store.listAccounts(platform)[0]
      const credentials = account?.cookies ? { cookies: JSON.parse(account.cookies) } : {}
      const data = await analyticsService.fetchPlatformData(platform, credentials)
      return { code: 0, data }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('analytics:platforms', async () => {
    try {
      return { code: 0, data: analyticsService.getRegisteredPlatforms() }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })
}

module.exports = registerHandlers
