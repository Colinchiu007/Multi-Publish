// @ts-check
/**
 * Model Provider IPC handlers
 * 全局模型服务商管理 — 5 类模型 CRUD + 默认设置
 */

function registerHandlers (ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { modelProviderManager, log } = deps

  // 确保 manager 已初始化
  function getManager () {
    if (!modelProviderManager) {
      throw new Error('ModelProviderManager not available')
    }
    modelProviderManager.init()
    return modelProviderManager
  }

  // ─── 列出服务商 ──────────────────────────────
  ipcMain.handle('model-provider:list', (_event, category) => {
    try {
      const mgr = getManager()
      const list = mgr.listProviders(category || undefined)
      return { code: 0, data: list }
    } catch (e) {
      log.error('[model-provider] list error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  // ─── 获取单个服务商 ──────────────────────────
  ipcMain.handle('model-provider:get', (_event, id) => {
    try {
      const mgr = getManager()
      const provider = mgr.getProvider(id)
      if (!provider) return { code: EC.REQUEST_ERROR, message: '服务商不存在' }
      return { code: 0, data: provider }
    } catch (e) {
      log.error('[model-provider] get error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 创建服务商 ──────────────────────────────
  ipcMain.handle('model-provider:create', (_event, data) => {
    try {
      const mgr = getManager()
      return mgr.createProvider(data)
    } catch (e) {
      log.error('[model-provider] create error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 更新服务商 ──────────────────────────────
  ipcMain.handle('model-provider:update', (_event, id, updates) => {
    try {
      const mgr = getManager()
      return mgr.updateProvider(id, updates)
    } catch (e) {
      log.error('[model-provider] update error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 删除服务商 ──────────────────────────────
  ipcMain.handle('model-provider:delete', (_event, id) => {
    try {
      const mgr = getManager()
      return mgr.deleteProvider(id)
    } catch (e) {
      log.error('[model-provider] delete error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 设置默认 ────────────────────────────────
  ipcMain.handle('model-provider:set-default', (_event, category, providerId) => {
    try {
      const mgr = getManager()
      return mgr.setDefault(category, providerId)
    } catch (e) {
      log.error('[model-provider] set-default error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 获取默认 ────────────────────────────────
  ipcMain.handle('model-provider:get-default', (_event, category) => {
    try {
      const mgr = getManager()
      const provider = mgr.getDefault(category)
      return { code: 0, data: provider }
    } catch (e) {
      log.error('[model-provider] get-default error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 测试连接 ────────────────────────────────
  ipcMain.handle('model-provider:test', async (_event, id) => {
    try {
      const mgr = getManager()
      return await mgr.testConnection(id)
    } catch (e) {
      log.error('[model-provider] test error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  // ─── 获取可用预设 ────────────────────────────
  ipcMain.handle('model-provider:presets', (_event, category) => {
    try {
      const mgr = getManager()
      const presets = mgr.getAvailablePresets(category)
      return { code: 0, data: presets }
    } catch (e) {
      log.error('[model-provider] presets error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  // ─── 检查是否已配置（某类别有 API Key） ──────
  ipcMain.handle('model-provider:is-configured', (_event, category) => {
    try {
      const mgr = getManager()
      const configured = mgr.isConfigured(category)
      return { code: 0, data: configured }
    } catch (e) {
      log.error('[model-provider] is-configured error:', e)
      return { code: EC.REQUEST_ERROR, message: e.message, data: false }
    }
  })
}

module.exports = registerHandlers
