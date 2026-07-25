// @ts-check
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { normalizeProxyConfig, toPublicProxyConfig } = require('../services/proxy-config')
  const { proxyPool } = deps

  function normalizePoolProxy(input) {
    const config = normalizeProxyConfig(input)
    if (!config) throw new Error('代理配置不能为空')
    if (config.username) throw new Error('代理池暂不支持认证代理')
    return config
  }

  function toPublicPoolProxy(proxy) {
    const id = typeof proxy?.id === 'string' ? proxy.id : undefined
    try {
      const config = toPublicProxyConfig({ host: proxy.host, port: proxy.port, type: proxy.type })
      const { configured, ...publicConfig } = config
      return {
        ...(id ? { id } : {}),
        ...publicConfig,
        ...(typeof proxy?.alive === 'boolean' ? { alive: proxy.alive } : {}),
        ...(Number.isFinite(proxy?.latency) ? { latency: proxy.latency } : {}),
        ...(Number.isFinite(proxy?.lastTested) ? { lastTested: proxy.lastTested } : {}),
        ...(Number.isInteger(proxy?.failCount) ? { failCount: proxy.failCount } : {}),
      }
    } catch (_) {
      return { ...(id ? { id } : {}), invalid: true }
    }
  }

  ipcMain.handle('proxy:add', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const config = normalizePoolProxy(arg)
      const id = proxyPool.addProxy(config.host, config.port, config.type); return { code: 0, data: { id } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:add-batch', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护 + 数组校验
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { proxies } = arg
      if (!Array.isArray(proxies)) return { code: EC.VALIDATION_ERROR, message: 'proxies 必须为数组' }
      proxyPool.addProxies(proxies.map(normalizePoolProxy)); return { code: 0, data: { total: proxyPool.size() } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:list', withSenderCheck(async () => {
    try { return { code: 0, data: proxyPool.getProxies().map(toPublicPoolProxy) } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  }))

  ipcMain.handle('proxy:remove', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id } = arg
      const ok = proxyPool.remove(id); return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '已移除' : '代理不存在' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:test', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, timeout } = arg
      const result = await proxyPool.testProxy(id, { timeout }); return { code: 0, data: result }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:test-all', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护（timeout 可选，允许 arg 为 undefined）
      const timeout = (arg && typeof arg === 'object') ? arg.timeout : undefined
      const results = await proxyPool.testAll({ timeout }); return { code: 0, data: results }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:status', withSenderCheck(async () => {
    try { return { code: 0, data: proxyPool.getStatus() } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, alive: 0, dead: 0 } } }
  }))

  ipcMain.handle('proxy:get-next', withSenderCheck(async () => {
    try { const proxy = proxyPool.getNextProxy(); return { code: 0, data: proxy ? toPublicPoolProxy(proxy) : null } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:reset', withSenderCheck(async () => {
    try { proxyPool.reset(); return { code: 0, data: true } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('proxy:remove-dead', withSenderCheck(async () => {
    try { const removed = proxyPool.removeDead(); return { code: 0, data: { removed } } }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
