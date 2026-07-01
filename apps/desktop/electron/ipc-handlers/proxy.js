function registerHandlers(ipcMain, deps) {
  const { proxyPool } = deps

  ipcMain.handle('proxy:add', async (_, { host, port, type }) => {
    try { const id = proxyPool.addProxy(host, port, type || 'http'); return { code: 0, data: { id } } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:add-batch', async (_, { proxies }) => {
    try { proxyPool.addProxies(proxies); return { code: 0, data: { total: proxyPool.size() } } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:list', async () => {
    try { return { code: 0, data: proxyPool.getProxies() } }
    catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle('proxy:remove', async (_, { id }) => {
    try { const ok = proxyPool.remove(id); return { code: ok ? 0 : -1, message: ok ? '已移除' : '代理不存在' } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:test', async (_, { id, timeout }) => {
    try { const result = await proxyPool.testProxy(id, { timeout }); return { code: 0, data: result } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:test-all', async (_, { timeout }) => {
    try { const results = await proxyPool.testAll({ timeout }); return { code: 0, data: results } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:status', async () => {
    try { return { code: 0, data: proxyPool.getStatus() } }
    catch (e) { return { code: -1, message: e.message, data: { total: 0, alive: 0, dead: 0 } } }
  })

  ipcMain.handle('proxy:get-next', async () => {
    try { const proxy = proxyPool.getNextProxy(); return { code: 0, data: proxy } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:reset', async () => {
    try { proxyPool.reset(); return { code: 0 } }
    catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('proxy:remove-dead', async () => {
    try { const removed = proxyPool.removeDead(); return { code: 0, data: { removed } } }
    catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
