module.exports = function registerHandlers(ipcMain, deps) {
  const { renderEngine, BrowserWindow } = deps
  ipcMain.handle('render:start', async (e, d) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const p = (pct, s) => w?.webContents.send('render:progress', {percent:pct, stage:s})
    const r = await renderEngine.render(d, {onProgress:p})
    if (r.success) w?.webContents.send('render:complete', r)
    else w?.webContents.send('render:error', r)
    return r
  })
  ipcMain.handle('render:cancel', () => { renderEngine.cancel(); return {success:true} })
  ipcMain.handle('render:status', () => renderEngine.getStatus())
}
