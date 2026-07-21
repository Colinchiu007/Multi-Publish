// @ts-check
/**
 * License IPC handlers
 * License/Pro features management
 *
 * 安全：activate/deactivate/activate-trial 为敏感操作，通过 withSenderCheck 校验来源
 *
 * Bug-2 三级分离：注册 auth:get-access-level 同步 IPC，供 preload/index.js 查询访问级别
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { isTrustedSender } = require('../core/ipc-security')
  const { getAccessLevel } = require('./license-access-control')
  const { licenseManager } = deps

  ipcMain.handle("license:info", async () => {
    try {
      return { code: 0, data: licenseManager.getInfo() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:activate", withSenderCheck(async (event, licenseKey) => {
    try {
      const ok = licenseManager.activate(licenseKey)
      return ok ? { code: 0, data: true, message: "激活成功" } : { code: EC.REQUEST_ERROR, data: false, message: "激活失败，许可证可能已被使用" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle("license:deactivate", withSenderCheck(async (event) => {
    try {
      licenseManager.deactivate()
      return { code: 0, data: true, message: "已注销" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle("license:activate-trial", withSenderCheck(async (event) => {
    try {
      const ok = licenseManager.activateTrial()
      return ok ? { code: 0, data: true, message: "试用已激活，有效期 7 天" } : { code: EC.REQUEST_ERROR, data: false, message: "无法激活试用" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

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
  // 安全：同步 IPC 不走 controlledIpcMain Proxy，需手动校验 sender 来源
  ipcMain.on("auth:get-access-level", (event) => {
    if (!isTrustedSender(event, deps && deps.app)) {
      // 不可信来源返回最低权限，防止外部页面探测许可证状态
      event.returnValue = 'public'
      return
    }
    try {
      event.returnValue = getAccessLevel(licenseManager, process.env, deps && deps.app, deps && deps.identityService)
    } catch (e) {
      event.returnValue = 'public'
    }
  })
}

module.exports = registerHandlers
