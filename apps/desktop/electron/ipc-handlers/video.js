// @ts-check
/**
 * 视频处理 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { videoEngine, BrowserWindow, log } = deps

  ipcMain.handle('video:status', () => {
    try {
      return { code: 0, data: videoEngine.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('video:list-process-types', () => {
    try {
      return { code: 0, data: videoEngine.listProcessTypes() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('video:list-analyze-types', () => {
    try {
      return { code: 0, data: videoEngine.listAnalyzeTypes() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('video:list-stock-sources', () => {
    try {
      return { code: 0, data: videoEngine.listStockSources() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('video:process', async (event, arg) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (p) => win?.webContents.send('video:progress', p)
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { type, params } = arg
      const result = await videoEngine.process(type, params, onProgress)
      win?.webContents.send('video:complete', result)
      return { code: 0, data: result }
    } catch (e) {
      const err = { code: EC.REQUEST_ERROR, message: e.message }
      win?.webContents.send('video:error', err)
      return err
    }
  })

  ipcMain.handle('video:analyze', async (_event, type, filePath) => {
    try {
      return { code: 0, data: await videoEngine.analyze(type, filePath) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('video:mix-audio', async (_event, params) => {
    try {
      return { code: 0, data: await videoEngine.mixAudio(params) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('video:search-stock', async (_event, query, source, limit) => {
    try {
      return { code: 0, data: await videoEngine.searchStock(query, source, limit) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('video:generate-subtitle', async (_event, audioPath, language) => {
    try {
      return { code: 0, data: await videoEngine.generateSubtitle(audioPath, language) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
