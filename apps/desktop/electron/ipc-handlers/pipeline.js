// @ts-check
/**
 * Pipeline 流水线编排 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { pipelineEngine, BrowserWindow, log } = deps

  ipcMain.handle('pipeline:list', withSenderCheck(() => {
    try {
      const list = pipelineEngine.listPipelines()
      return { code: 0, data: Array.isArray(list) ? list : [] }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  }))

  ipcMain.handle('pipeline:get', withSenderCheck((_event, name) => {
    if (typeof name !== 'string' || !name.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法流水线名称' }
    try {
      return { code: 0, data: pipelineEngine.getPipeline(name) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:start', withSenderCheck(async (_event, name, params) => {
    if (typeof name !== 'string' || !name.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法流水线名称' }
    if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) {
      return { code: EC.VALIDATION_ERROR, message: '流水线参数必须为对象' }
    }
    try {
      const result = await pipelineEngine.start(name, params || {})
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] start error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:pause', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.pause() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:resume', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.resume() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:cancel', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.cancel() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:status', withSenderCheck((_event, name) => {
    if (typeof name !== 'string' || !name.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法流水线名称' }
    try {
      return { code: 0, data: pipelineEngine.getStatus(name) }
    } catch (err) {
      log.error('[pipeline] status error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:advance', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.advance() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:history', withSenderCheck(() => {
    try {
      const history = pipelineEngine.getHistory()
      return { code: 0, data: Array.isArray(history) ? history : [] }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  }))

  ipcMain.handle('pipeline:fetch', withSenderCheck(async (_event, name) => {
    if (typeof name !== 'string' || !name.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法流水线名称' }
    try {
      const result = await pipelineEngine.fetchPipelineFromBackend(name)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] fetch error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  // ---- 编排模式（Orchestrator）IPC handlers ----

  ipcMain.handle('pipeline:startOrchestrated', withSenderCheck(async (_event, name, params) => {
    if (typeof name !== 'string' || !name.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法流水线名称' }
    if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) {
      return { code: EC.VALIDATION_ERROR, message: '编排参数必须为对象' }
    }
    try {
      const result = await pipelineEngine.startOrchestrated(name, params || {})
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] startOrchestrated error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:resumeOrchestration', withSenderCheck(async (_event, runId) => {
    if (typeof runId !== 'string' || !runId.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 runId' }
    try {
      const result = await pipelineEngine.resumeOrchestration(runId)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] resumeOrchestration error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:executeStage', withSenderCheck(async (_event, runId) => {
    if (typeof runId !== 'string' || !runId.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 runId' }
    try {
      const result = await pipelineEngine.executeStage(runId)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] executeStage error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:advanceToNextCheckpoint', withSenderCheck(async (_event, runId) => {
    if (typeof runId !== 'string' || !runId.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 runId' }
    try {
      const result = await pipelineEngine.advanceToNextCheckpoint(runId)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] advanceToNextCheckpoint error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  // 分镜素材自选（manual）：确认每个场景的素材选择并推进（finalize_assets → compose → publish）
  ipcMain.handle('pipeline:confirmSceneAssets', withSenderCheck(async (_event, runId, selections) => {
    if (typeof runId !== 'string' || !runId.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 runId' }
    if (!Array.isArray(selections)) return { code: EC.VALIDATION_ERROR, message: '素材选择必须为数组' }
    try {
      const result = await pipelineEngine.confirmSceneAssets(runId, selections)
      return { code: 0, data: result }
    } catch (err) {
      log.error('[pipeline] confirmSceneAssets error:', err)
      return { code: EC.REQUEST_ERROR, message: err.message }
    }
  }))

  ipcMain.handle('pipeline:getRunContext', withSenderCheck((_event, runId) => {
    if (typeof runId !== 'string' || !runId.trim()) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 runId' }
    try {
      const snapshot = typeof pipelineEngine.getRunSnapshot === 'function'
        ? pipelineEngine.getRunSnapshot(runId)
        : pipelineEngine.getRunContext(runId)
      if (!snapshot) return { code: EC.NOT_FOUND, message: '未找到指定的流水线运行' }
      // 附带模型服务异常快照：仅包含该运行创建后（含）记录的异常（按运行归属过滤，避免跨运行残留）；
      // 运行无 createdAt 时由 snapshotSince 回退全量快照，不隐藏警告。
      const { providerAnomalyBus } = require('../services/provider-anomaly')
      const providerWarnings = providerAnomalyBus.snapshotSince(snapshot.createdAt)
      return { code: 0, data: providerWarnings.length > 0 ? { ...snapshot, providerWarnings } : snapshot }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:pauseWithCheckpoint', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.pauseWithCheckpoint() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:resumeFromCheckpoint', withSenderCheck(() => {
    try {
      return { code: 0, data: pipelineEngine.resumeFromCheckpoint() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:registerPipeline', withSenderCheck((_event, def) => {
    try {
      return { code: 0, data: pipelineEngine.registerPipeline(def) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('pipeline:registerStageExecutor', withSenderCheck((_event, stageType, fn) => {
    try {
      return { code: 0, data: pipelineEngine.registerStageExecutor(stageType, fn) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  // ---- 阶段进度实时推送（openspec pipeline-progress-real-time-push）----
  // PipelineEngine 事件 → 轻量快照（progressOnly，不含 context）→ 受信主窗口 webContents.send('pipeline:update')。
  // 节流：每 run 500ms 窗口合并（窗口内最后一次快照）；run 终态（pipeline:complete/fail）立即发送。
  const PUSH_CHANNEL = 'pipeline:update'
  const PUSH_WINDOW_MS = 500
  const pushTimers = new Map()   // runId -> timer
  const pushTerminal = new Set() // runId 已进入终态，不再排队
  let pushBridgeInstalled = false
  const pushOffFns = []

  const getMainWindow = () => {
    const wins = BrowserWindow.getAllWindows()
    return wins.find(w => !w.isDestroyed() && !w.webContents.isDestroyed() && w.isVisible()) ||
      wins.find(w => !w.isDestroyed() && !w.webContents.isDestroyed()) || null
  }

  const sendPush = (runId) => {
    try {
      const snapshot = typeof pipelineEngine.getRunSnapshot === 'function'
        ? pipelineEngine.getRunSnapshot(runId, { progressOnly: true })
        : null
      if (!snapshot) return
      const win = getMainWindow()
      if (win) win.webContents.send(PUSH_CHANNEL, snapshot)
    } catch (e) {
      log.warn('[pipeline:push] send failed:', e && e.message ? e.message : String(e))
    }
  }

  const flushPush = (runId) => {
    pushTimers.delete(runId)
    pushTerminal.delete(runId)
    sendPush(runId)
  }

  const queuePush = (runId, terminal) => {
    if (!runId) return
    if (terminal) {
      if (pushTimers.has(runId)) { clearTimeout(pushTimers.get(runId)); pushTimers.delete(runId) }
      pushTerminal.delete(runId)
      sendPush(runId)
      return
    }
    if (pushTimers.has(runId) || pushTerminal.has(runId)) return
    pushTimers.set(runId, setTimeout(() => flushPush(runId), PUSH_WINDOW_MS))
  }

  const installPushBridge = () => {
    if (pushBridgeInstalled || !pipelineEngine || typeof pipelineEngine.on !== 'function') return
    pushBridgeInstalled = true
    const onEvent = (terminal) => (data) => {
      const runId = data && (data.runId || data.run)
      if (!runId) return
      if (terminal) pushTerminal.add(runId)
      queuePush(runId, terminal)
    }
    const subscriptions = [
      ['stage:start', false],
      ['stage:complete', false],
      ['stage:fail', false],
      ['stage:progress', false],
      ['checkpoint:pause', false],
      ['pipeline:complete', true],
      ['pipeline:fail', true],
    ]
    for (const [eventName, terminal] of subscriptions) {
      const off = pipelineEngine.on(eventName, onEvent(terminal))
      if (typeof off === 'function') pushOffFns.push(off)
    }
  }

  const cleanupPushBridge = () => {
    pushBridgeInstalled = false
    pushOffFns.splice(0).forEach(off => { try { off() } catch (_e) { /* ignore */ } })
    for (const timer of pushTimers.values()) clearTimeout(timer)
    pushTimers.clear()
    pushTerminal.clear()
  }

  installPushBridge()
  return { cleanup: cleanupPushBridge }
}

module.exports = registerHandlers
