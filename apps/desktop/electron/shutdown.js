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
    try { hotkeys.unregister() } catch (e) { log.error('App', 'Error unregistering hotkeys:', e.message) }
    try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
    try { if (global.usageTracker) { global.usageTracker.save() } } catch (e) { log.error('App', 'Error saving usage:', e.message) }
    try { webviewManager.closeAll() } catch (e) { log.error('App', 'Error closing webviews:', e.message) }
    try { rpaViewManager.cleanup() } catch (e) { log.error('App', 'Error cleaning rpa views:', e.message) }
    try { keywordMonitor.stopAll() } catch (e) { log.error('App', 'Error stopping keyword monitor:', e.message) }
    try { callbackServer.stop() } catch (e) { log.error('App', 'Error stopping callback server:', e.message) }
    try { store.close() } catch (e) { log.error('App', 'Error closing store:', e.message) }
    if (process.platform !== 'darwin') app.quit()
  })
}

module.exports = { registerShutdownHandlers }
