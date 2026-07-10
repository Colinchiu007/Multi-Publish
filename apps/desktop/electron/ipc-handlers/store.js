// @ts-check
/**
 * Store IPC handlers
 *
 * 安全：所有 handler 包裹 try-catch，防止 store 抛错变成 unhandled rejection
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { store, credentialStore, accountStateRestorer } = deps

  ipcMain.handle('store:add-account', (_, account) => {
    try {
      const ok = store.addAccount(account)
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:get-account', (_, id) => {
    try {
      const account = store.getAccount(id)
      return { code: account ? 0 : EC.NOT_FOUND, data: account }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:list-accounts', (_, platform) => {
    try {
      return { code: 0, data: store.listAccounts(platform) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-account', (_, id) => {
    try {
      store.deleteAccount(id)
      // 修复 P2：级联清理凭证和登录状态（原仅删 accounts 表，孤儿数据残留）
      if (credentialStore && credentialStore.deleteCredential) {
        try { credentialStore.deleteCredential(id) } catch (e) { /* best-effort */ }
      }
      if (accountStateRestorer && accountStateRestorer.deleteAccountRecord) {
        try { accountStateRestorer.deleteAccountRecord(id) } catch (e) { /* best-effort */ }
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:set-default-account', (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, accountId } = arg
      store.setDefaultAccount(platform, accountId)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:get-default-account', (_, platform) => {
    try {
      const account = store.getDefaultAccount(platform)
      return { code: account ? 0 : EC.NOT_FOUND, data: account }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:update-account', (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, fields } = arg
      store.updateAccount(id, fields)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:add-publish-record', (_, record) => {
    try {
      const id = store.addPublishRecord(record)
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:list-publish-history', (_, opts) => {
    try {
      return { code: 0, data: store.listPublishHistory(opts) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, records: [] } }
    }
  })

  ipcMain.handle('store:get-publish-stats', () => {
    try {
      return { code: 0, data: store.getPublishStats() }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, success: 0, failed: 0, byPlatform: {} } }
    }
  })

  ipcMain.handle('store:add-scheduled-task', (_, task) => {
    try {
      const id = store.addScheduledTask(task)
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:list-scheduled-tasks', () => {
    try {
      return { code: 0, data: store.listScheduledTasks() }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-task', (_, id) => {
    try {
      store.deleteTask(id)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:get-setting', (_, key) => {
    try {
      return { code: 0, data: store.getSetting(key) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:set-setting', (_, key, value) => {
    try {
      store.setSetting(key, value)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('store:list-callback-logs', (_, limit) => {
    try {
      return { code: 0, data: store.listCallbackLogs(limit) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })
}

module.exports = registerHandlers
