// @ts-check
/**
 * Pipeline 管线编排 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { pipelineEngine, BrowserWindow, log } = deps

  ipcMain.handle('pipeline:list', () => {
    try {
      // R52 修复：统一为标准 { code, data, message } 格式
      const list = pipelineEngine.listPipelines()
      return { code: 0, data: Array.isArray(list) ? list : [] }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:get', (_event, name) => {
    try {
      // R52 修复：成功路径也包裹为标准格式
      return { code: 0, data: pipelineEngine.getPipeline(name) }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:start', async (_event, name, params) => {
    try {
      // R52 修复：统一为标准格式
      const result = await pipelineEngine.start(name, params || {})
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] start error:', err)
      return { code: -1, message: err.message }
    }
  })

  ipcMain.handle('pipeline:pause', () => {
    try {
      return { code: 0, data: pipelineEngine.pause() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:resume', () => {
    try {
      return { code: 0, data: pipelineEngine.resume() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:cancel', () => {
    try {
      return { code: 0, data: pipelineEngine.cancel() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:status', (_event, name) => {
    try {
      // R52 修复：统一为标准格式
      return { code: 0, data: pipelineEngine.getStatus(name) }
    } catch (err) {
      log.error('[pipeline] status error:', err)
      return { code: -1, message: err.message }
    }
  })

  ipcMain.handle('pipeline:advance', () => {
    try {
      return { code: 0, data: pipelineEngine.advance() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('pipeline:history', () => {
    try {
      // R52 修复：统一为标准格式
      const history = pipelineEngine.getHistory()
      return { code: 0, data: Array.isArray(history) ? history : [] }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:fetch', async (_event, name) => {
    try {
      // R52 修复：统一为标准格式
      const result = await pipelineEngine.fetchPipelineFromBackend(name)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] fetch error:', err)
      return { code: -1, message: err.message }
    }
  })
}

module.exports = registerHandlers
