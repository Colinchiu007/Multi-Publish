// @ts-check
/**
 * 日志 IPC handlers（设置-通用设置）
 *
 * 通道：
 *   - logs:info   返回日志目录信息（目录/文件列表/总大小/单文件上限），供设置页展示
 *   - logs:clear  手动清理全部 app-*.log 日志文件，返回清理数量
 *   - logs:error  渲染进程错误上报（Vue errorHandler / window error → 文件日志 ERROR 级）
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { log } = deps
  const feedback = require('../services/feedback')

  ipcMain.handle('logs:info', () => {
    try {
      return { code: 0, data: log.getLogsInfo() }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('logs:clear', () => {
    try {
      const removed = log.clearLogs()
      log.info('Logs', '用户手动清理日志文件', { removed })
      return { code: 0, data: { removed } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('logs:error', (_event, payload) => {
    try {
      const message = payload && typeof payload === 'object' ? payload.message : String(payload || '')
      log.error('Renderer', message || '未知渲染进程错误')
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('feedback:submit', async (_event, payload) => {
    try {
      const data = payload && typeof payload === 'object' ? payload : {}
      const appVersion = deps.app && typeof deps.app.getVersion === 'function' ? deps.app.getVersion() : ''
      return await feedback.submitFeedback({
        opsCenterSync: deps.opsCenterSync,
        log,
        loggerModule: log,
        message: data.message,
        includeLogs: data.includeLogs === true,
        appVersion,
        platform: process.platform,
      })
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: '反馈提交失败，请稍后重试' }
    }
  })
}

module.exports = registerHandlers
