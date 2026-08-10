// @ts-check
/**
 * ops-center-sync IPC handlers — 运营后台同步配置与手动同步
 */

function registerHandlers (ipcMain, deps) {
  const { opsCenterSync, log } = deps
  if (!opsCenterSync) {
    log && log.warn('OpsCenterSync', 'opsCenterSync service not provided')
    return
  }

  ipcMain.handle('ops-center-sync:get', () => {
    try { return { code: 0, config: opsCenterSync.getConfig() } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('ops-center-sync:save', (_event, payload) => {
    try {
      const data = (payload && typeof payload === 'object') ? payload : {}
      return opsCenterSync.saveConfig({
        url: data.url,
        apiKey: data.apiKey,
        autoSync: data.autoSync !== false,
      })
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('ops-center-sync:now', async () => {
    try { return await opsCenterSync.syncNow() }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('ops-center-sync:runtime', () => {
    try {
      if (typeof opsCenterSync.getRuntimeState !== 'function') return { code: -1, message: '运行时策略服务未就绪' }
      return { code: 0, data: opsCenterSync.getRuntimeState() }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = { registerHandlers }