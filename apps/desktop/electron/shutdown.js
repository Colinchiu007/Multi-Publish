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
    systemTray, scheduler, publishImpactTracker,
    authViewManager, qrCodeLogin, oauthManager,
    batchManager, taskQueue, commentManager,
    renderEngine,
  } = context

  // ─── 窗口关闭 ──────────────────────────────
  app.on('window-all-closed', async () => {
    // 停止接受新任务 / 清理定时器
    try { hotkeys.unregister() } catch (e) { log.error('App', 'Error unregistering hotkeys:', e.message) }
    try { if (scheduler && scheduler.stopAll) scheduler.stopAll() } catch (e) { log.error('App', 'Error stopping scheduler:', e.message) }
    try { if (batchManager && batchManager.stopAll) batchManager.stopAll() } catch (e) { log.error('App', 'Error stopping batch manager:', e.message) }
    try { if (publishImpactTracker && publishImpactTracker.stopAll) publishImpactTracker.stopAll() } catch (e) { log.error('App', 'Error stopping impact tracker:', e.message) }
    try { if (commentManager && commentManager.stopAll) commentManager.stopAll() } catch (e) { log.error('App', 'Error stopping comment manager:', e.message) }

    // 停止外部进程
    try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
    try { if (renderEngine && renderEngine.cancel) renderEngine.cancel() } catch (e) { log.error('App', 'Error canceling render:', e.message) }

    // 保存状态
    try { if (global.usageTracker) { global.usageTracker.save() } } catch (e) { log.error('App', 'Error saving usage:', e.message) }

    // 关闭视图 / 窗口
    try { webviewManager.closeAll() } catch (e) { log.error('App', 'Error closing webviews:', e.message) }
    try { rpaViewManager.cleanup() } catch (e) { log.error('App', 'Error cleaning rpa views:', e.message) }
    try { if (authViewManager && authViewManager.close) authViewManager.close() } catch (e) { log.error('App', 'Error closing auth views:', e.message) }
    try { if (qrCodeLogin && qrCodeLogin.close) qrCodeLogin.close() } catch (e) { log.error('App', 'Error closing qrcode login:', e.message) }
    try { if (oauthManager && oauthManager.close) oauthManager.close() } catch (e) { log.error('App', 'Error closing oauth:', e.message) }

    // 停止监控 / 服务
    try { keywordMonitor.stopAll() } catch (e) { log.error('App', 'Error stopping keyword monitor:', e.message) }
    try { callbackServer.stop() } catch (e) { log.error('App', 'Error stopping callback server:', e.message) }
    try { if (systemTray && systemTray.destroy) systemTray.destroy() } catch (e) { log.error('App', 'Error destroying tray:', e.message) }

    // 清理事件监听器
    try { if (taskQueue && taskQueue.removeAllListeners) taskQueue.removeAllListeners() } catch (e) { log.error('App', 'Error removing taskQueue listeners:', e.message) }

    // 关闭存储
    try { store.close() } catch (e) { log.error('App', 'Error closing store:', e.message) }

    if (process.platform !== 'darwin') app.quit()
  })
}

module.exports = { registerShutdownHandlers }
