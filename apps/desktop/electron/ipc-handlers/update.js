// @ts-check
function registerHandlers(ipcMain, deps) {
  const { autoUpdater } = deps

  ipcMain.handle('update:check', async () => {
    try {
      autoUpdater.check()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('update:download', async () => {
    try {
      autoUpdater.download()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('update:install', async () => {
    try {
      autoUpdater.quitAndInstall()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
