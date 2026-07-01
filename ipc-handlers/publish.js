module.exports = function registerHandlers(ipcMain, deps) {
  const { taskQueue } = deps
  ipcMain.handle('publish:wechat', async (e, d) => ({code:0, data:{taskId: taskQueue.add({platform:'wechat_mp', article:d, retry:2, timeout:180000})}}))
  ipcMain.handle('publish:batch', async (e, {platforms, article}) => ({code:0, data:{taskIds: platforms.map(p => taskQueue.add({platform:p, article, retry:2, timeout:180000}))}}))
  ipcMain.handle('queue:status', () => taskQueue.getStatus())
  ipcMain.handle('queue:history', () => ({code:0, data: taskQueue.getHistory()}))
  ipcMain.handle('queue:cancel', async (e, id) => { taskQueue.cancel(id); return {code:0} })
}
