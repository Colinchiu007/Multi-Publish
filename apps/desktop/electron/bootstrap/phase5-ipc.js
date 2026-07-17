// @ts-check
/**
 * Phase 5: IPC Handler 注册
 *
 * 从 bootstrap.js 拆出：
 * - registerAllHandlers（业务 IPC）
 * - usage:* 系列（使用量统计 IPC）
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 ≤ 80 行
 * P1-B: 所有 ipcMain.handle 加 sender 来源验证，防恶意页面调用
 */
const { ipcMain } = require('electron')
const { isTrustedSender } = require('../core/ipc-security')
const log = require('../services/logger')

/**
 * 注册所有 IPC handlers
 * @param {object} deps
 * @param {object} deps.app - Electron app 实例
 * @param {object} deps.BrowserWindow - BrowserWindow 类
 * @param {object} deps.context - createAppContext 返回的上下文
 */
function registerAllIpcHandlers({ app, BrowserWindow, context }) {
  const {
    renderEngine, taskQueue, history, scheduler, autoUpdater, hotkeys, firstRun,
    authViewManager, pythonBridge, AccountManager, store,
    _platformConfig, _sensitiveFilter, _dataSync,
    analyticsService, proxyPool, _chunkedUploader, keywordMonitor,
    BACKEND_PLATFORMS, templateManager, licenseManager, aiWriter,
    compositionManager, aiGenerator, videoEngine, pipelineEngine, modelProviderManager,
    projectService, boardService, contactSheetService, approvalGateService,
    executionRecorder,
  } = context

  // 业务 IPC handlers
  const registerAllHandlers = require('../ipc-handlers')
  registerAllHandlers(ipcMain, {
    app, BrowserWindow, log, renderEngine, taskQueue, history,
    scheduler, autoUpdater, hotkeys, firstRun, authViewManager, pythonBridge,
    AccountManager, store, _platformConfig, _sensitiveFilter, _dataSync,
    analyticsService, proxyPool, _chunkedUploader, keywordMonitor,
    BACKEND_PLATFORMS, templateManager, licenseManager, aiWriter,
    compositionManager, aiGenerator, videoEngine, pipelineEngine, modelProviderManager,
    projectService, boardService, contactSheetService, approvalGateService,
    executionRecorder,
  })

  // 使用量统计 IPC — P1-B: 加 sender 来源验证
  ipcMain.handle('usage:stats', (event) => {
    if (!isTrustedSender(event, app)) {
      log.warn('IPC', 'usage:stats rejected: untrusted sender')
      return { features: {}, events: [], sessions: 0 }
    }
    try {
      if (global.usageTracker) return global.usageTracker.getStats()
      return { features: {}, events: [], sessions: 0 }
    } catch (e) {
      return { code: -1, message: e.message, features: {}, events: [], sessions: 0 }
    }
  })

  ipcMain.handle('usage:daily', (event) => {
    if (!isTrustedSender(event, app)) {
      log.warn('IPC', 'usage:daily rejected: untrusted sender')
      return {}
    }
    try {
      if (global.usageTracker) return global.usageTracker.getDailyStats()
      return {}
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('usage:track', (event, args) => {
    if (!isTrustedSender(event, app)) {
      log.warn('IPC', 'usage:track rejected: untrusted sender')
      return false
    }
    try {
      if (global.usageTracker && args) {
        global.usageTracker.trackEvent(args.feature, args.action, args.detail)
      }
      return true
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })
}

module.exports = { registerAllIpcHandlers, isTrustedSender }
