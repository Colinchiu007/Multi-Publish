// @ts-check
/**
 * Pipeline 流水线编排 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { pipelineEngine, BrowserWindow, log } = deps

  ipcMain.handle('pipeline:list', () => {
    try {
      const list = pipelineEngine.listPipelines()
      return { code: 0, data: Array.isArray(list) ? list : [] }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:get', (_event, name) => {
    try {
      return { code: 0, data: pipelineEngine.getPipeline(name) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:start', withSenderCheck(async (_event, name, params) => {
    try {
      const result = await pipelineEngine.start(name, params || {})
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] start error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:pause', () => {
    try {
      return { code: 0, data: pipelineEngine.pause() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:resume', () => {
    try {
      return { code: 0, data: pipelineEngine.resume() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:cancel', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.cancel() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:status', (_event, name) => {
    try {
      return { code: 0, data: pipelineEngine.getStatus(name) }
    } catch (err) {
      log.error('[pipeline] status error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  ipcMain.handle('pipeline:advance', () => {
    try {
      return { code: 0, data: pipelineEngine.advance() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:history', () => {
    try {
      const history = pipelineEngine.getHistory()
      return { code: 0, data: Array.isArray(history) ? history : [] }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('pipeline:fetch', async (_event, name) => {
    try {
      const result = await pipelineEngine.fetchPipelineFromBackend(name)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] fetch error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  // ---- 编排模式（Orchestrator）IPC handlers ----

  ipcMain.handle('pipeline:startOrchestrated', withSenderCheck(async (_event, name, params) => {
    try {
      const result = await pipelineEngine.startOrchestrated(name, params || {})
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] startOrchestrated error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:executeStage', async (_event, runId) => {
    try {
      const result = await pipelineEngine.executeStage(runId)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] executeStage error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  ipcMain.handle('pipeline:advanceToNextCheckpoint', async (_event, runId) => {
    try {
      const result = await pipelineEngine.advanceToNextCheckpoint(runId)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] advanceToNextCheckpoint error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  })

  ipcMain.handle('pipeline:getRunContext', (_event, runId) => {
    try {
      return { code: 0, data: pipelineEngine.getRunContext(runId) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:pauseWithCheckpoint', () => {
    try {
      return { code: 0, data: pipelineEngine.pauseWithCheckpoint() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:resumeFromCheckpoint', () => {
    try {
      return { code: 0, data: pipelineEngine.resumeFromCheckpoint() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:registerPipeline', (_event, def) => {
    try {
      return { code: 0, data: pipelineEngine.registerPipeline(def) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('pipeline:registerStageExecutor', (_event, stageType, fn) => {
    try {
      return { code: 0, data: pipelineEngine.registerStageExecutor(stageType, fn) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
