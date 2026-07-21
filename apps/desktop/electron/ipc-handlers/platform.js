// @ts-check
const definitions = require('@multi-publish/shared-utils/src/platform-definitions')

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { _platformConfig } = deps

  ipcMain.handle('platform:list', async () => {
    try {
      if (!_platformConfig) return { code: EC.REQUEST_ERROR, message: '配置未加载', data: [] }
      return { code: 0, data: _platformConfig.listPlatforms() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('platform:get', async (_, id) => {
    try {
      if (!_platformConfig) return { code: EC.REQUEST_ERROR, message: '配置未加载' }
      const p = _platformConfig.getPlatform(id)
      return { code: p ? 0 : EC.NOT_FOUND, data: p }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  // 统一平台元数据（单一数据源）
  ipcMain.handle('platform:definitions', async () => {
    try {
      // PRD F9: 附带 content_category 映射（从 platformConfig 提取）
      let contentCategories = {}
      let categories = {}
      if (_platformConfig) {
        for (const p of _platformConfig.listPlatforms()) {
          if (p.content_category) contentCategories[p.id] = p.content_category
          if (p.category) categories[p.id] = p.category
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
          categories,
        },
      }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
