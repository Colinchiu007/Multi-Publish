function registerHandlers(ipcMain, deps) {
  const { analyticsService, store, BrowserWindow, log } = deps

  ipcMain.handle('analytics:overview', async () => {
    try {
      const platforms = analyticsService.getRegisteredPlatforms()
      if (platforms.length === 0) return { code: 0, data: [] }
      const credentialsMap = {}
      for (const p of platforms) {
        const account = store.listAccounts(p)[0]
        if (account?.cookies) {
          try { credentialsMap[p] = { cookies: JSON.parse(account.cookies) } }
          catch (e) { credentialsMap[p] = {} }
        }
      }
      const data = await analyticsService.fetchOverview(platforms, credentialsMap)
      return { code: 0, data }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('analytics:platform', async (_, { platform }) => {
    try {
      const account = store.listAccounts(platform)[0]
      const credentials = account?.cookies ? { cookies: JSON.parse(account.cookies) } : {}
      const data = await analyticsService.fetchPlatformData(platform, credentials)
      return { code: 0, data }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('analytics:platforms', async () => {
    try {
      return { code: 0, data: analyticsService.getRegisteredPlatforms() }
    } catch (e) {
      return { code: -1, message: e.message, data: [] }
    }
  })
}

module.exports = registerHandlers
