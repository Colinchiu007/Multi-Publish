// @ts-check
/**
 * Store IPC handlers
 *
 * 安全：所有 handler 包裹 try-catch，防止 store 抛错变成 unhandled rejection
 */
function registerHandlers(ipcMain, deps) {
  const { store } = deps

  ipcMain.handle('store:add-account', (_, account) => {
    try {
      const ok = store.addAccount(account)
      return { code: ok ? 0 : -1 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:get-account', (_, id) => {
    try {
      const account = store.getAccount(id)
      return { code: account ? 0 : -1, data: account }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:list-accounts', (_, platform) => {
    try {
      return { code: 0, data: store.listAccounts(platform) }
    } catch (e) {
      return { code: -1, message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-account', (_, id) => {
    try {
      store.deleteAccount(id)
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:set-default-account', (_, { platform, accountId }) => {
    try {
      store.setDefaultAccount(platform, accountId)
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:get-default-account', (_, platform) => {
    try {
      const account = store.getDefaultAccount(platform)
      return { code: account ? 0 : -1, data: account }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:update-account', (_, { id, fields }) => {
    try {
      store.updateAccount(id, fields)
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:add-publish-record', (_, record) => {
    try {
      const id = store.addPublishRecord(record)
      return { code: id ? 0 : -1, data: { id } }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:list-publish-history', (_, opts) => {
    try {
      return { code: 0, data: store.listPublishHistory(opts) }
    } catch (e) {
      return { code: -1, message: e.message, data: { total: 0, records: [] } }
    }
  })

  ipcMain.handle('store:get-publish-stats', () => {
    try {
      return { code: 0, data: store.getPublishStats() }
    } catch (e) {
      return { code: -1, message: e.message, data: { total: 0, success: 0, failed: 0, byPlatform: {} } }
    }
  })

  ipcMain.handle('store:add-scheduled-task', (_, task) => {
    try {
      const id = store.addScheduledTask(task)
      return { code: id ? 0 : -1, data: { id } }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:list-scheduled-tasks', () => {
    try {
      return { code: 0, data: store.listScheduledTasks() }
    } catch (e) {
      return { code: -1, message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-task', (_, id) => {
    try {
      store.deleteTask(id)
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:get-setting', (_, key) => {
    try {
      return { code: 0, data: store.getSetting(key) }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:set-setting', (_, key, value) => {
    try {
      store.setSetting(key, value)
      return { code: 0 }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('store:list-callback-logs', (_, limit) => {
    try {
      return { code: 0, data: store.listCallbackLogs(limit) }
    } catch (e) {
      return { code: -1, message: e.message, data: [] }
    }
  })
}

module.exports = registerHandlers
