// @ts-check
/**
 * 渲染 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  // eslint-disable-next-line no-unused-vars
  const { renderEngine, BrowserWindow, log } = deps

  ipcMain.handle('render:start', async (event, data) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const onProgress = (percent, stage) => { win?.webContents.send('render:progress', { percent, stage }) }
      const result = await renderEngine.render(data.props || data, { onProgress, profile: data.profile })
      if (result.success) win?.webContents.send('render:complete', result)
      else win?.webContents.send('render:error', result)
      return result
    } catch (err) {
      log.error('[render] render:start error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('render:cancel', () => {
    try {
      renderEngine.cancel(); return { success: true }
    } catch (e) { return { code: -1, message: e.message } }
  })
  ipcMain.handle('render:status', () => {
    try {
      return renderEngine.getStatus()
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('render:install-deps', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      return await renderEngine.installDeps((text) => win?.webContents.send('render:install-progress', { text }))
    } catch (err) {
      log.error('[render] install-deps error:', err)
      return { success: false, error: err.message }
    }
  })

  // --- Composition 管理（Phase 1）---
  ipcMain.handle('render:list-compositions', () => {
    try {
      return renderEngine.listCompositions();
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('render:get-composition', (_event, id) => {
    try {
      return renderEngine.getComposition(id);
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('render:validate-props', (_event, compositionId, props) => {
    try {
      return renderEngine.validateProps(compositionId, props);
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
