// @ts-check
const definitions = require('@multi-publish/shared-utils/src/platform-definitions')

function registerHandlers(ipcMain, deps) {
  const { _platformConfig } = deps

  ipcMain.handle('platform:list', async () => {
    try {
      if (!_platformConfig) return { code: -1, message: '配置未加载', data: [] }
      return { code: 0, data: _platformConfig.listPlatforms() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('platform:get', async (_, id) => {
    try {
      if (!_platformConfig) return { code: -1, message: '配置未加载' }
      const p = _platformConfig.getPlatform(id)
      return { code: p ? 0 : -1, data: p }
    } catch (e) { return { code: -1, message: e.message } }
  })

  // 统一平台元数据（单一数据源）
  ipcMain.handle('platform:definitions', async () => {
    try {
      // PRD F9: 附带 content_category 映射（从 platformConfig 提取）
      let contentCategories = {}
      if (_platformConfig) {
        for (const p of _platformConfig.listPlatforms()) {
          if (p.content_category) contentCategories[p.id] = p.content_category
        }
      }
      return {
        code: 0,
        data: {
          loginUrls: definitions.PLATFORM_LOGIN_URLS,
          names: definitions.PLATFORM_NAMES,
          icons: definitions.PLATFORM_ICONS,
          dashboardUrls: definitions.PLATFORM_DASHBOARD_URLS,
          successPatterns: definitions.PLATFORM_LOGIN_SUCCESS_PATTERNS,
          qrCodePlatforms: definitions.QR_CODE_PLATFORMS,
          content_categories: contentCategories,  // PRD F9
        },
      }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
