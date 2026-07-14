// @ts-check
/**
 * Phase 5: IPC Handler 注册
 *
 * 从 bootstrap.js 拆出：
 * - registerAllHandlers（业务 IPC）
 * - usage:* 系列（使用量统计 IPC）
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 ≤ 80 行
 */
const { ipcMain } = require('electron')
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
  })

  // 使用量统计 IPC
  ipcMain.handle('usage:stats', () => {
    try {
      if (global.usageTracker) return global.usageTracker.getStats()
      return { features: {}, events: [], sessions: 0 }
    } catch (e) {
      return { code: -1, message: e.message, features: {}, events: [], sessions: 0 }
    }
  })

  ipcMain.handle('usage:daily', () => {
    try {
      if (global.usageTracker) return global.usageTracker.getDailyStats()
      return {}
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('usage:track', (event, args) => {
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

module.exports = { registerAllIpcHandlers }
