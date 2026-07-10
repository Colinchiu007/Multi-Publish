// @ts-check
/**
 * Template IPC handlers
 * CRUD for content templates via TemplateManager
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { templateManager } = deps

  ipcMain.handle('template:list', async () => {
    try {
      const templates = templateManager.list()
      return { code: 0, data: templates }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('template:get', async (event, id) => {
    try {
      const tpl = templateManager.get(id)
      return tpl ? { code: 0, data: tpl } : { code: EC.NOT_FOUND, message: '模板未找到' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('template:add', async (event, tpl) => {
    try {
      const added = templateManager.add(tpl)
      return { code: 0, data: added, message: '模板已添加' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('template:update', async (event, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, updates } = arg
      const updated = templateManager.update(id, updates)
      return updated ? { code: 0, data: updated, message: '模板已更新' } : { code: EC.NOT_FOUND, message: '模板未找到' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('template:delete', async (event, id) => {
    try {
      const ok = templateManager.delete(id)
      // R52 修复：统一返回格式，补充 data 字段
      return ok ? { code: 0, data: true, message: '模板已删除' } : { code: EC.NOT_FOUND, data: false, message: '模板未找到' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('template:list-by-category', async (event, category) => {
    try {
      const templates = templateManager.listByCategory(category)
      return { code: 0, data: templates }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('template:get-presets', async () => {
    try {
      const { TemplateManager } = require('../services/template-manager')
      return { code: 0, data: TemplateManager.getPresets() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })
}

module.exports = registerHandlers
