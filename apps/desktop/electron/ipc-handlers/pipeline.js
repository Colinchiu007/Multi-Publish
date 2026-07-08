// @ts-check
/**
 * Pipeline 管线编排 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { pipelineEngine, BrowserWindow, log } = deps

  ipcMain.handle('pipeline:list', () => {
    return pipelineEngine.listPipelines()
  })

  ipcMain.handle('pipeline:get', (_event, name) => {
    return pipelineEngine.getPipeline(name)
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
    return pipelineEngine.pause()
  })

  ipcMain.handle('pipeline:resume', () => {
    return pipelineEngine.resume()
  })

  ipcMain.handle('pipeline:cancel', () => {
    return pipelineEngine.cancel()
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
    return pipelineEngine.advance()
  })

  ipcMain.handle('pipeline:history', () => {
    return pipelineEngine.getHistory()
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
