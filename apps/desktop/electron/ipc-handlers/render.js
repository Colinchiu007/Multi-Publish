// @ts-check
/**
 * 渲染 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  // eslint-disable-next-line no-unused-vars
  const { renderEngine, BrowserWindow, log } = deps

  ipcMain.handle('render:start', async (event, data) => {
    try {
      // R51 P0 修复：data 为 undefined 时 data.props / data.profile 属性访问必崩
      if (!data || typeof data !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少 data 参数' }
      const win = BrowserWindow.fromWebContents(event.sender)
      const onProgress = (percent, stage) => { win?.webContents.send('render:progress', { percent, stage }) }
      const result = await renderEngine.render(data.props || data, { onProgress, profile: data.profile })
      if (result.success) win?.webContents.send('render:complete', result)
      else win?.webContents.send('render:error', result)
      // R52 修复：统一为标准 { code, data, message } 格式
      return { code: 0, data: result }
    } catch (err) {
      log.error('[render] render:start error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  ipcMain.handle('render:cancel', () => {
    try {
      // R52 修复：统一为标准格式
      renderEngine.cancel(); return { code: 0, data: true }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('render:status', () => {
    try {
      // R52 修复：成功路径包裹为标准格式
      return { code: 0, data: renderEngine.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('render:install-deps', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await renderEngine.installDeps((text) => win?.webContents.send('render:install-progress', { text }))
      // R52 修复：统一为标准格式
      return { code: 0, data: result }
    } catch (err) {
      log.error('[render] install-deps error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  // --- Composition 管理（Phase 1）---
  ipcMain.handle('render:list-compositions', () => {
    try {
      // R52 修复：成功路径包裹为标准格式
      return { code: 0, data: renderEngine.listCompositions() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('render:get-composition', (_event, id) => {
    try {
      // R52 修复：成功路径包裹为标准格式
      return { code: 0, data: renderEngine.getComposition(id) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('render:validate-props', (_event, compositionId, props) => {
    try {
      // R52 修复：成功路径包裹为标准格式
      return { code: 0, data: renderEngine.validateProps(compositionId, props) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
