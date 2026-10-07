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
  const log = require('../services/logger')
  const { withSenderCheck } = require('./helpers')
  const { isTrustedSender } = require('../core/ipc-security')
  const { getAccessLevel } = require('./license-access-control')
  const { ACCESS_LEVEL_CHANNEL } = require('../core/access-level')
  const { emitAccessLevelInvalidated } = require('../services/access-level-bus')
  const { licenseManager } = deps

  ipcMain.handle("license:info", async () => {
    try {
      return { code: 0, data: licenseManager.getInfo() }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:activate", withSenderCheck(async (event, licenseKey) => {
    // 2026-10-07 修复 P0 权限泄漏。
    //
    // 实测：`licenseManager.activate(key)` 原本**只对 key 做 trim()**，没有任何
    // 有效性校验，输入 `a` / `随便什么字符串` / `"   "` 一律返回 true，并写入
    // type=pro + expiresAt=null（**永不过期**）+ 8 项 PRO_FEATURES。
    // 而 preload 通过 contextBridge 把 licenseActivate 暴露给了渲染层，
    // `UpgradeModal` 的激活码输入框在正式包里也可见 ⇒ 任意字符串即可白嫖永久 Pro。
    //
    // 根因不在"少了个校验"，而是**本地存在一条不经服务端核销的授权路径**。
    // 服务端 `POST /api/v1/redeem` 已经带 `durationDays` 与事务化到期结算
    // （subscription-service.js，注释明写「防止订阅已 expired + 快照仍为 pro
    // 的永久权限泄漏」），本条路径把它绕开了。
    //
    // 因此按「业务权益是服务端权威」的口径（见 license-access-control.js 顶部
    // 注释），**正式构建一律拒收本地激活码**，激活码改走服务端核销。
    // 开发构建保留：未上线、无真实用户，local 调试需要这条路径。
    //
    // 口径与 `payment:simulate`（#3006）/ `payment:create-order`（#3075）一致：
    // 只认 `app.isPackaged !== false`，环境变量不能覆盖打包事实。
    const { app } = require('electron')
    if (!app || app.isPackaged !== false) {
      return { code: EC.REQUEST_ERROR, data: false, message: '激活码已迁移至账号核销，本地激活在正式版停用' }
    }
    try {
      const ok = licenseManager.activate(licenseKey)
      // 审计 P2·性能税：preload 的级别缓存必须在此失效，否则升级最长要等一个 TTL 才生效
      if (ok) emitAccessLevelInvalidated('license-activate')
      return ok ? { code: 0, data: true, message: "激活成功" } : { code: EC.REQUEST_ERROR, data: false, message: "激活失败，许可证可能已被使用" }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle("license:deactivate", withSenderCheck(async (event) => {
    try {
      licenseManager.deactivate()
      emitAccessLevelInvalidated('license-deactivate')
      return { code: 0, data: true, message: "已注销" }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle("license:activate-trial", withSenderCheck(async (event) => {
    try {
      const ok = licenseManager.activateTrial()
      if (ok) emitAccessLevelInvalidated('license-activate-trial')
      return ok ? { code: 0, data: true, message: "试用已激活，有效期 7 天" } : { code: EC.REQUEST_ERROR, data: false, message: "无法激活试用" }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle("license:has-feature", async (event, featureName) => {
    try {
      return { code: 0, data: licenseManager.hasFeature(featureName) }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("license:features", async () => {
    try {
      return { code: 0, data: licenseManager.getFeatures() }
    } catch (e) { log.warn('[ipc:license]', ((e && e.message) || String(e))); return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  // Bug-2 三级分离：同步 IPC 供 preload 查询访问级别
  // 返回 'public' | 'authenticated' | 'admin'
  // 安全：同步 IPC 不走 controlledIpcMain Proxy，需手动校验 sender 来源
  //
  // Bug fix (QM-5): 开发模式 admin 短路必须与异步 IPC (license-access-control.js getAccessLevel) 保持一致。
  // 之前同步 IPC 直接调用 isTrustedSender，未走 dev 短路，导致开发环境下 preload sendSync 拿到 'public'，
  // 所有 authenticated 级别方法（storeGetPublishStats / onRenderProgress 等）被错误拦截。
  // 根因：同步 IPC 与异步 IPC 的权限校验路径不一致。
  ipcMain.on(ACCESS_LEVEL_CHANNEL, (event) => {
    // Bug fix (QM-5 v2): dev 短路判断必须与项目其他模块一致！
    // window.js:216 用 `!app.isPackaged` 作为 dev 判断，license-access-control.js 和本文件
    // 之前用 `NODE_ENV === 'development'`，但 npm script 没有设置该变量，导致 dev 短路不生效。
    // 修复：直接用 `!app.isPackaged` 作为 dev 判断，与项目保持一致。
    const app = deps && deps.app
    const isDevMode = app && app.isPackaged === false
    if (isDevMode) {
      event.returnValue = 'admin'
      return
    }
    if (!isTrustedSender(event, app)) {
      // 不可信来源返回最低权限，防止外部页面探测许可证状态
      event.returnValue = 'public'
      return
    }
    try {
      event.returnValue = getAccessLevel(licenseManager, process.env, app, deps && deps.identityService)
    } catch (e) {
      event.returnValue = 'public'
    }
  })
}

module.exports = registerHandlers
