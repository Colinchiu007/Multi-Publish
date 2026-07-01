module.exports = function registerHandlers(ipcMain, deps) {
  const { proxyPool } = deps
  ipcMain.handle('proxy:add', (_, { host, port, type }) => proxyPool.addProxy(host, port, type))
  ipcMain.handle('proxy:add-batch', (_, { proxies }) => proxyPool.addBatch(proxies))
  ipcMain.handle('proxy:list', () => proxyPool.list())
  ipcMain.handle('proxy:remove', (_, { id }) => proxyPool.remove(id))
  ipcMain.handle('proxy:test', (_, { id, timeout }) => proxyPool.test(id, timeout))
  ipcMain.handle('proxy:test-all', (_, { timeout }) => proxyPool.testAll(timeout))
  ipcMain.handle('proxy:status', () => proxyPool.getStatus())
  ipcMain.handle('proxy:get-next', () => proxyPool.getNext())
  ipcMain.handle('proxy:reset', () => proxyPool.reset())
  ipcMain.handle('proxy:remove-dead', () => proxyPool.removeDead())
}
