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
    return pipelineEngine.start(name, params || {})
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
    return pipelineEngine.getStatus(name)
  })

  ipcMain.handle('pipeline:advance', () => {
    return pipelineEngine.advance()
  })

  ipcMain.handle('pipeline:history', () => {
    return pipelineEngine.getHistory()
  })

  ipcMain.handle('pipeline:fetch', async (_event, name) => {
    return await pipelineEngine.fetchPipelineFromBackend(name)
  })
}

module.exports = registerHandlers
