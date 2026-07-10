// @ts-check
/**
 * License IPC handlers
 * License/Pro features management
 *
 * 安全：activate/deactivate/activate-trial 为敏感操作，校验来源必须是本应用主窗口
 */
function registerHandlers(ipcMain, deps) {
  const { licenseManager } = deps

  // 安全：校验 IPC 调用来源是本应用渲染进程
  function _assertTrustedSender(event) {
    if (!deps || !deps.BrowserWindow) return true // 测试环境放行
    try {
      const allWindows = deps.BrowserWindow.getAllWindows()
      const senderWin = event && event.sender ? event.sender : null
      if (!senderWin) return false
      return allWindows.some(function(w) { return w === senderWin || w.webContents === senderWin })
    } catch (e) {
      return false
    }
  }

  function _untrusted() {
    return { code: -1, message: '未授权的调用来源' }
  }

  ipcMain.handle("license:info", async () => {
    try {
      return { code: 0, data: licenseManager.getInfo() }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:activate", async (event, licenseKey) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const ok = licenseManager.activate(licenseKey)
      // R52 修复：统一返回格式，补充 data 字段
      return ok ? { code: 0, data: true, message: "激活成功" } : { code: -1, data: false, message: "激活失败，许可证可能已被使用" }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:deactivate", async (event) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      licenseManager.deactivate()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true, message: "已注销" }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle("license:activate-trial", async (event) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const ok = licenseManager.activateTrial()
      // R52 修复：统一返回格式，补充 data 字段
      return ok ? { code: 0, data: true, message: "试用已激活，有效期 7 天" } : { code: -1, data: false, message: "无法激活试用" }
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
