// @ts-check
/**
 * License IPC handlers
 * License/Pro features management
 *
 * 安全：activate/deactivate/activate-trial 为敏感操作，校验来源必须是本应用主窗口
 *
 * Bug-2 三级分离：注册 auth:get-access-level 同步 IPC，供 preload/index.js 查询访问级别
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
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
    return { code: EC.AUTH_ERROR, message: '未授权的调用来源' }
  }

  ipcMain.handle("license:info", async () => {
    try {
      return { code: 0, data: licenseManager.getInfo() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:activate", async (event, licenseKey) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const ok = licenseManager.activate(licenseKey)
      return ok ? { code: 0, data: true, message: "激活成功" } : { code: EC.REQUEST_ERROR, data: false, message: "激活失败，许可证可能已被使用" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:deactivate", async (event) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      licenseManager.deactivate()
      return { code: 0, data: true, message: "已注销" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:activate-trial", async (event) => {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const ok = licenseManager.activateTrial()
      return ok ? { code: 0, data: true, message: "试用已激活，有效期 7 天" } : { code: EC.REQUEST_ERROR, data: false, message: "无法激活试用" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:has-feature", async (event, featureName) => {
    try {
      return { code: 0, data: licenseManager.hasFeature(featureName) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:features", async () => {
    try {
      return { code: 0, data: licenseManager.getFeatures() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  // Bug-2 三级分离：同步 IPC 供 preload 查询访问级别
  // 返回 'public' | 'authenticated' | 'admin'
  ipcMain.on("auth:get-access-level", (event) => {
    try {
      const isDevMode = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1'
      if (isDevMode) {
        event.returnValue = 'admin'
        return
      }
      if (licenseManager && typeof licenseManager.isPro === 'function' && licenseManager.isPro()) {
        event.returnValue = 'authenticated'
      } else {
        event.returnValue = 'public'
      }
    } catch (e) {
      event.returnValue = 'public'
    }
  })
}

module.exports = registerHandlers