// @ts-check
/**
 * Offline IPC handlers
 */
// eslint-disable-next-line no-unused-vars
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const offlineManager = require("../services/offline-manager")

  ipcMain.handle("offline:status", async function() {
    try {
      return { code: 0, data: offlineManager.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("offline:is-offline", async function() {
    try {
      return { code: 0, data: offlineManager.isOffline() }
    } catch (e) { return { code: -1, message: e.message, data: false } }
  })

  ipcMain.handle("offline:cached-tasks", async function() {
    try {
      return { code: 0, data: offlineManager.loadCache() }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle("offline:add-to-cache", async function(event, task) {
    try {
      const ok = offlineManager.addToCache(task)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : -1, data: ok, message: ok ? "已缓存" : "缓存失败" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle("offline:clear-cache", async function() {
    try {
      offlineManager.clearSuccessfulTasks()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true, message: "已清理" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
