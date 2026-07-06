// @ts-check
/**
 * License IPC handlers
 * License/Pro features management
 */
function registerHandlers(ipcMain, deps) {
  const { licenseManager } = deps

  ipcMain.handle("license:info", async () => {
    try {
      return { code: 0, data: licenseManager.getInfo() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:activate", async (event, licenseKey) => {
    try {
      const ok = licenseManager.activate(licenseKey)
      return ok ? { code: 0, message: "激活成功" } : { code: -1, message: "激活失败，许可证可能已被使用" }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:deactivate", async () => {
    try {
      licenseManager.deactivate()
      return { code: 0, message: "已注销" }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:activate-trial", async () => {
    try {
      const ok = licenseManager.activateTrial()
      return ok ? { code: 0, message: "试用已激活，有效期 7 天" } : { code: -1, message: "无法激活试用" }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:has-feature", async (event, featureName) => {
    try {
      return { code: 0, data: licenseManager.hasFeature(featureName) }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:features", async () => {
    try {
      return { code: 0, data: licenseManager.getFeatures() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })
}

module.exports = registerHandlers
