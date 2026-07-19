// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { proxyPool } = deps

  ipcMain.handle('proxy:add', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { host, port, type } = arg
      const id = proxyPool.addProxy(host, port, type || 'http'); return { code: 0, data: { id } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:add-batch', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护 + 数组校验
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { proxies } = arg
      if (!Array.isArray(proxies)) return { code: EC.VALIDATION_ERROR, message: 'proxies 必须为数组' }
      proxyPool.addProxies(proxies); return { code: 0, data: { total: proxyPool.size() } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:list', async () => {
    try { return { code: 0, data: proxyPool.getProxies() } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('proxy:remove', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id } = arg
      const ok = proxyPool.remove(id); return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '已移除' : '代理不存在' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:test', async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, timeout } = arg
      const result = await proxyPool.testProxy(id, { timeout }); return { code: 0, data: result }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('proxy:test-all', async (_, arg) => {
    try {
      // R51 P1：解构保护（timeout 可选，允许 arg 为 undefined）
      const timeout = (arg && typeof arg === 'object') ? arg.timeout : undefined
      const results = await proxyPool.testAll({ timeout }); return { code: 0, data: results }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('proxy:status', async () => {
    try { return { code: 0, data: proxyPool.getStatus() } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, alive: 0, dead: 0 } } }
  })

  ipcMain.handle('proxy:get-next', async () => {
    try { const proxy = proxyPool.getNextProxy(); return { code: 0, data: proxy } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('proxy:reset', async () => {
    try { proxyPool.reset(); return { code: 0, data: true } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('proxy:remove-dead', withSenderCheck(async () => {
    try { const removed = proxyPool.removeDead(); return { code: 0, data: { removed } } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
