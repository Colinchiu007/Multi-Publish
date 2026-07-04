/**
 * Template IPC handlers
 * CRUD for content templates via TemplateManager
 */
function registerHandlers(ipcMain, deps) {
  const { templateManager } = deps

  ipcMain.handle('template:list', async () => {
    try {
      const templates = templateManager.list()
      return { code: 0, data: templates }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('template:get', async (event, id) => {
    try {
      const tpl = templateManager.get(id)
      return tpl ? { code: 0, data: tpl } : { code: -1, message: '模板未找到' }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('template:add', async (event, tpl) => {
    try {
      const added = templateManager.add(tpl)
      return { code: 0, data: added, message: '模板已添加' }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('template:update', async (event, { id, updates }) => {
    try {
      const updated = templateManager.update(id, updates)
      return updated ? { code: 0, data: updated, message: '模板已更新' } : { code: -1, message: '模板未找到' }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('template:delete', async (event, id) => {
    try {
      const ok = templateManager.delete(id)
      return ok ? { code: 0, message: '模板已删除' } : { code: -1, message: '模板未找到' }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('template:list-by-category', async (event, category) => {
    try {
      const templates = templateManager.listByCategory(category)
      return { code: 0, data: templates }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('template:get-presets', async () => {
    try {
      const { TemplateManager } = require('../template-manager')
      return { code: 0, data: TemplateManager.getPresets() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })
}

module.exports = registerHandlers
