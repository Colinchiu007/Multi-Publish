module.exports = function registerHandlers(ipcMain, deps) {
  const { store } = deps
  ipcMain.handle('accounts:list', async () => ({code:0, data: store.listAccounts()}))
}
