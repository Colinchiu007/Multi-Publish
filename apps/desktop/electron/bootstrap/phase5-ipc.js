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
const log = require('../services/logger')

/**
 * 验证 IPC 调用来源是否可信
 * 白名单：app:// 协议、file:// 协议、开发模式 localhost
 * @param {object} event - Electron IPC event
 * @param {object} app - Electron app 实例（用于判断 isPackaged）
 * @returns {boolean} 来源可信返回 true
 */
function isTrustedSender(event, app) {
  if (!event || !event.senderFrame) return false
  const url = event.senderFrame.url
  if (!url) return false
  // 生产模式：app:// 协议（Electron 自定义协议）
  if (url.startsWith('app://')) return true
  // file:// 协议（本地文件加载）
  if (url.startsWith('file://')) return true
  // 开发模式：localhost / 127.0.0.1
  if (process.env.NODE_ENV === 'development' || (app && !app.isPackaged)) {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return true
  }
  return false
}

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
