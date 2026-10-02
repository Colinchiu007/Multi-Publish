// @ts-check
/**
 * automation IPC handlers — 自动化任务模块前端桥接
 *
 * 后台语义（PRD §六）：任务在主进程后台执行，不阻塞渲染进程。
 * 本文件只做「渲染层意图 → 调度器」的转发与契约收敛，不承载执行逻辑。
 */

function registerHandlers (ipcMain, deps) {
  const { automationScheduler, log } = deps
  if (!automationScheduler) {
    log && log.warn('Automation', 'automationScheduler service not provided')
    return
  }
  const warn = (e) => log && log.warn('[ipc:automation]', ((e && e.message) || String(e)))

  ipcMain.handle('automation:list', () => {
    try { return { code: 0, data: { tasks: automationScheduler.list() } } }
    catch (e) { warn(e); return { code: -1, message: e.message, data: { tasks: [] } } }
  })

  ipcMain.handle('automation:create', (_event, payload) => {
    try {
      const r = automationScheduler.create(payload)
      if (!r.ok) return { code: 0, ok: false, reason: r.reason, task: null }
      return { code: 0, ok: true, task: r.task }
    } catch (e) { warn(e); return { code: -1, message: e.message, ok: false } }
  })

  ipcMain.handle('automation:update', (_event, id, payload) => {
    try {
      const r = automationScheduler.update(String(id || ''), payload)
      if (!r.ok) return { code: 0, ok: false, reason: r.reason, task: null }
      return { code: 0, ok: true, task: r.task }
    } catch (e) { warn(e); return { code: -1, message: e.message, ok: false } }
  })

  ipcMain.handle('automation:remove', (_event, id) => {
    try {
      const r = automationScheduler.remove(String(id || ''))
      return { code: 0, ok: !!r.ok, reason: r.reason || '' }
    } catch (e) { warn(e); return { code: -1, message: e.message, ok: false } }
  })

  ipcMain.handle('automation:run-now', async (_event, id) => {
    try {
      const r = await automationScheduler.runNow(String(id || ''))
      return { code: 0, ok: !!r.ok, data: { reason: r.reason || '', status: r.status || '' } }
    } catch (e) { warn(e); return { code: -1, message: e.message, ok: false } }
  })
}

module.exports = { registerHandlers }
