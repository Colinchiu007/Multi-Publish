// @ts-check
/**
 * Aggregation IPC handlers — 热文采集模块前端桥接
 *
 * 通过 pythonBridge.requestBackend 调用 Python 后端的 aggregation API。
 * 通道：
 *   aggregation:collect      → POST /aggregation/collect
 *   aggregation:collect-batch→ POST /aggregation/collect/batch
 *   aggregation:rewrite      → POST /aggregation/rewrite
 *   aggregation:sources      → GET  /aggregation/sources
 *   aggregation:task-status  → GET  /aggregation/tasks/{id}
 */

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   pythonBridge: { requestBackend: (method: string, path: string, body?: unknown, timeout?: number) => Promise<unknown> },
 *   log?: { info: Function, warn: Function, error: Function }
 * }} deps
 */
function registerHandlers(ipcMain, deps) {
  const { pythonBridge, log } = deps
  const logger = log || { info: () => {}, warn: () => {}, error: () => {} }

  ipcMain.handle('aggregation:collect', async (_event, payload) => {
    try {
      return await pythonBridge.requestBackend('POST', '/aggregation/collect', payload || {})
    } catch (e) {
      logger.error(`[aggregation] collect failed: ${e && e.message ? e.message : String(e)}`)
      return { code: -99, message: e && e.message ? e.message : '采集失败' }
    }
  })

  ipcMain.handle('aggregation:collect-batch', async (_event, payload) => {
    try {
      return await pythonBridge.requestBackend('POST', '/aggregation/collect/batch', payload || {})
    } catch (e) {
      logger.error(`[aggregation] collect-batch failed: ${e && e.message ? e.message : String(e)}`)
      return { code: -99, message: e && e.message ? e.message : '批量采集失败' }
    }
  })

  ipcMain.handle('aggregation:rewrite', async (_event, payload) => {
    try {
      return await pythonBridge.requestBackend('POST', '/aggregation/rewrite', payload || {})
    } catch (e) {
      logger.error(`[aggregation] rewrite failed: ${e && e.message ? e.message : String(e)}`)
      return { code: -99, message: e && e.message ? e.message : '改写失败' }
    }
  })

  ipcMain.handle('aggregation:sources', async () => {
    try {
      return await pythonBridge.requestBackend('GET', '/aggregation/sources', null)
    } catch (e) {
      logger.error(`[aggregation] sources failed: ${e && e.message ? e.message : String(e)}`)
      return { code: -99, message: e && e.message ? e.message : '获取采集源失败' }
    }
  })

  ipcMain.handle('aggregation:task-status', async (_event, taskId) => {
    try {
      return await pythonBridge.requestBackend('GET', `/aggregation/tasks/${encodeURIComponent(String(taskId))}`, null)
    } catch (e) {
      logger.error(`[aggregation] task-status failed: ${e && e.message ? e.message : String(e)}`)
      return { code: -99, message: e && e.message ? e.message : '获取任务状态失败' }
    }
  })
}

module.exports = registerHandlers
