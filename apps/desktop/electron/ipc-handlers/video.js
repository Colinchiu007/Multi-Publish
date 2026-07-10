// @ts-check
/**
 * 视频处理 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { videoEngine, BrowserWindow, log } = deps

  ipcMain.handle('video:status', () => {
    try {
      // R52 修复：成功路径包裹为标准格式
      return { code: 0, data: videoEngine.getStatus() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('video:list-process-types', () => {
    try {
      return { code: 0, data: videoEngine.listProcessTypes() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('video:list-analyze-types', () => {
    try {
      return { code: 0, data: videoEngine.listAnalyzeTypes() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('video:list-stock-sources', () => {
    try {
      return { code: 0, data: videoEngine.listStockSources() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('video:process', async (event, { type, params }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (p) => win?.webContents.send('video:progress', p)
    try {
      const result = await videoEngine.process(type, params, onProgress)
      win?.webContents.send('video:complete', result)
      // R52 修复：统一为标准 { code, data, message } 格式
      return { code: 0, data: result }
    } catch (e) {
      const err = { code: -1, message: e.message }
      win?.webContents.send('video:error', err)
      return err
    }
  })

  ipcMain.handle('video:analyze', async (_event, type, filePath) => {
    try {
      return { code: 0, data: await videoEngine.analyze(type, filePath) }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('video:mix-audio', async (_event, params) => {
    try {
      return { code: 0, data: await videoEngine.mixAudio(params) }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('video:search-stock', async (_event, query, source, limit) => {
    try {
      return { code: 0, data: await videoEngine.searchStock(query, source, limit) }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('video:generate-subtitle', async (_event, audioPath, language) => {
    try {
      return { code: 0, data: await videoEngine.generateSubtitle(audioPath, language) }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
