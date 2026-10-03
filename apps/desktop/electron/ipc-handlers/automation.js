// @ts-check
/**
 * automation IPC handlers — 自动化任务模块前端桥接
 *
 * 后台语义（PRD §六）：任务在主进程后台执行，不阻塞渲染进程。
 * 本文件只做「渲染层意图 → 调度器」的转发与契约收敛，不承载执行逻辑。
 *
 * ⚠️ 依赖缺失时**不得静默 return**（2026-10-03 修复）：
 * 旧实现在 automationScheduler 缺失时只 warn 就 return，一个 handler 都不注册，
 * 渲染层拿到的是 Electron 原生的 "No handler registered for 'automation:create'"
 * —— 这句话不含任何「真正原因是依赖没接上」的线索，排查成本极高。
 * 新实现仍注册全部通道，返回带明确 reason 的错误，让断线在界面上可读。
 */

/** 依赖缺失时的统一降级返回 */
function unavailable () {
  return {
    code: -1,
    message: '自动化服务未就绪（automationScheduler 未注入），请重启应用',
    reason: 'service-unavailable',
  }
}

function registerHandlers (ipcMain, deps) {
  const { automationScheduler, log } = deps
  const warn = (e) => log && log.warn('[ipc:automation]', ((e && e.message) || String(e)))

  if (!automationScheduler) {
    log && log.error('Automation', 'automationScheduler service not provided — handlers registered in degraded mode')
    // 降级注册：通道照样存在，避免渲染层收到无信息量的 "No handler registered"
    for (const channel of [
      'automation:list', 'automation:create', 'automation:update',
      'automation:remove', 'automation:run-now',
    ]) {
      ipcMain.handle(channel, () => unavailable())
    }
    return
  }

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

module.exports = registerHandlers
