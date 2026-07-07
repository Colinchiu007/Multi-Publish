// @ts-check
/**
 * 渲染 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  // eslint-disable-next-line no-unused-vars
  const { renderEngine, BrowserWindow, log } = deps

  ipcMain.handle('render:start', async (event, data) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (percent, stage) => { win?.webContents.send('render:progress', { percent, stage }) }
    const result = await renderEngine.render(data.props || data, { onProgress, profile: data.profile })
    if (result.success) win?.webContents.send('render:complete', result)
    else win?.webContents.send('render:error', result)
    return result
  })

  ipcMain.handle('render:cancel', () => { renderEngine.cancel(); return { success: true } })
  ipcMain.handle('render:status', () => renderEngine.getStatus())

  ipcMain.handle('render:install-deps', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await renderEngine.installDeps((text) => win?.webContents.send('render:install-progress', { text }))
  })

  // --- Composition 管理（Phase 1）---
  ipcMain.handle('render:list-compositions', () => {
    return renderEngine.listCompositions();
  })

  ipcMain.handle('render:get-composition', (_event, id) => {
    return renderEngine.getComposition(id);
  })

  ipcMain.handle('render:validate-props', (_event, compositionId, props) => {
    return renderEngine.validateProps(compositionId, props);
  })
}

module.exports = registerHandlers
