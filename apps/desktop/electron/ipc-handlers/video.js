// @ts-check
/**
 * 视频处理 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { videoEngine, BrowserWindow, log } = deps

  ipcMain.handle('video:status', () => {
    return videoEngine.getStatus()
  })

  ipcMain.handle('video:list-process-types', () => {
    return videoEngine.listProcessTypes()
  })

  ipcMain.handle('video:list-analyze-types', () => {
    return videoEngine.listAnalyzeTypes()
  })

  ipcMain.handle('video:list-stock-sources', () => {
    return videoEngine.listStockSources()
  })

  ipcMain.handle('video:process', async (event, { type, params }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (p) => win?.webContents.send('video:progress', p)
    try {
      const result = await videoEngine.process(type, params, onProgress)
      win?.webContents.send('video:complete', result)
      return result
    } catch (e) {
      const err = { success: false, error: e.message }
      win?.webContents.send('video:error', err)
      return err
    }
  })

  ipcMain.handle('video:analyze', async (_event, type, filePath) => {
    return await videoEngine.analyze(type, filePath)
  })

  ipcMain.handle('video:mix-audio', async (_event, params) => {
    return await videoEngine.mixAudio(params)
  })

  ipcMain.handle('video:search-stock', async (_event, query, source, limit) => {
    return await videoEngine.searchStock(query, source, limit)
  })

  ipcMain.handle('video:generate-subtitle', async (_event, audioPath, language) => {
    return await videoEngine.generateSubtitle(audioPath, language)
  })
}

module.exports = registerHandlers
