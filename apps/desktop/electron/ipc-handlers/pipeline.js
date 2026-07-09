// @ts-check
/**
 * Pipeline 管线编排 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { pipelineEngine, BrowserWindow, log } = deps

  ipcMain.handle('pipeline:list', () => {
    try {
      return pipelineEngine.listPipelines()
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:get', (_event, name) => {
    try {
      return pipelineEngine.getPipeline(name)
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:start', async (_event, name, params) => {
    try {
      return await pipelineEngine.start(name, params || {})
    } catch (err) {
      log.error('[pipeline] start error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('pipeline:pause', () => {
    try {
      return pipelineEngine.pause()
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:resume', () => {
    try {
      return pipelineEngine.resume()
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:cancel', () => {
    try {
      return pipelineEngine.cancel()
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:status', (_event, name) => {
    try {
      return pipelineEngine.getStatus(name)
    } catch (err) {
      log.error('[pipeline] status error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('pipeline:advance', () => {
    try {
      return pipelineEngine.advance()
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:history', () => {
    try {
      return pipelineEngine.getHistory()
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:fetch', async (_event, name) => {
    try {
      return await pipelineEngine.fetchPipelineFromBackend(name)
    } catch (err) {
      log.error('[pipeline] fetch error:', err)
      return { success: false, error: err.message }
    }
  })
}

module.exports = registerHandlers
