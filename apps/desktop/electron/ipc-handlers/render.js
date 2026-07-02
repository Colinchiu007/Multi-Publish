/**
 * 渲染 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
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
}

module.exports = registerHandlers
