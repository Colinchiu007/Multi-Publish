// @ts-nocheck
/**
 * shutdown.js — 退出清理模块（从 main.js 拆分）
 *
 * 职责：
 *   - registerShutdownHandlers(context)：注册 window-all-closed 退出清理
 */
const { app } = require('electron')
const log = require('./services/logger')

/**
 * 注册退出清理处理器
 * @param {object} context - bootstrap 创建的上下文
 */
function registerShutdownHandlers(context) {
  const {
    hotkeys, pythonBridge,
    webviewManager, rpaViewManager, keywordMonitor,
    callbackServer, store,
  } = context

  // ─── 窗口关闭 ──────────────────────────────
  app.on('window-all-closed', async () => {
    hotkeys.unregister()
    try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
    if (global.usageTracker) { global.usageTracker.save() }
    webviewManager.closeAll()
    rpaViewManager.cleanup()
    keywordMonitor.stopAll()
    callbackServer.stop()
    store.close()
    if (process.platform !== 'darwin') app.quit()
  })
}

module.exports = { registerShutdownHandlers }
