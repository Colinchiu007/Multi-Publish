const definitions = require('@multi-publish/shared-utils/src/platform-definitions')

function registerHandlers(ipcMain, deps) {
  const { _platformConfig } = deps

  ipcMain.handle('platform:list', async () => {
    if (!_platformConfig) return { code: -1, message: '配置未加载', data: [] }
    return { code: 0, data: _platformConfig.listPlatforms() }
  })

  ipcMain.handle('platform:get', async (_, id) => {
    if (!_platformConfig) return { code: -1, message: '配置未加载' }
    const p = _platformConfig.getPlatform(id)
    return { code: p ? 0 : -1, data: p }
  })

  // 统一平台元数据（单一数据源）
  ipcMain.handle('platform:definitions', async () => {
    return {
      code: 0,
      data: {
        loginUrls: definitions.PLATFORM_LOGIN_URLS,
        names: definitions.PLATFORM_NAMES,
        icons: definitions.PLATFORM_ICONS,
        dashboardUrls: definitions.PLATFORM_DASHBOARD_URLS,
        successPatterns: definitions.PLATFORM_LOGIN_SUCCESS_PATTERNS,
        qrCodePlatforms: definitions.QR_CODE_PLATFORMS,
      },
    }
  })
}

module.exports = registerHandlers
