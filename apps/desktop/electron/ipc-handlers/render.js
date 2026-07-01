/**
 * 渲染 IPC handlers
 * render:start → 启动渲染
 * render:cancel → 取消渲染
 * render:status → 查询渲染状态
 */

function registerHandlers(ipcMain, deps) {
  const { renderEngine, BrowserWindow, log } = deps

  ipcMain.handle('render:start', async (event, data) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (percent, stage) => {
      win?.webContents.send('render:progress', { percent, stage })
    }
    const result = await renderEngine.render(data, { onProgress })
    if (result.success) {
      win?.webContents.send('render:complete', result)
    } else {
      win?.webContents.send('render:error', result)
    }
    return result
  })

  ipcMain.handle('render:cancel', () => {
    renderEngine.cancel()
    return { success: true }
  })

  ipcMain.handle('render:status', () => renderEngine.getStatus())
}

module.exports = registerHandlers
