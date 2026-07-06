// @ts-check
function registerHandlers(ipcMain, deps) {
  const { store } = deps

  ipcMain.handle('store:add-account', (_, account) => {
    const ok = store.addAccount(account)
    return { code: ok ? 0 : -1 }
  })

  ipcMain.handle('store:get-account', (_, id) => {
    const account = store.getAccount(id)
    return { code: account ? 0 : -1, data: account }
  })

  ipcMain.handle('store:list-accounts', (_, platform) => {
    return { code: 0, data: store.listAccounts(platform) }
  })

  ipcMain.handle('store:delete-account', (_, id) => {
    store.deleteAccount(id)
    return { code: 0 }
  })

  ipcMain.handle('store:set-default-account', (_, { platform, accountId }) => {
    store.setDefaultAccount(platform, accountId)
    return { code: 0 }
  })

  ipcMain.handle('store:get-default-account', (_, platform) => {
    const account = store.getDefaultAccount(platform)
    return { code: account ? 0 : -1, data: account }
  })

  ipcMain.handle('store:update-account', (_, { id, fields }) => {
    store.updateAccount(id, fields)
    return { code: 0 }
  })

  ipcMain.handle('store:add-publish-record', (_, record) => {
    const id = store.addPublishRecord(record)
    return { code: id ? 0 : -1, data: { id } }
  })

  ipcMain.handle('store:list-publish-history', (_, opts) => {
    return { code: 0, data: store.listPublishHistory(opts) }
  })

  ipcMain.handle('store:get-publish-stats', () => {
    return { code: 0, data: store.getPublishStats() }
  })

  ipcMain.handle('store:add-scheduled-task', (_, task) => {
    const id = store.addScheduledTask(task)
    return { code: id ? 0 : -1, data: { id } }
  })

  ipcMain.handle('store:list-scheduled-tasks', () => {
    return { code: 0, data: store.listScheduledTasks() }
  })

  ipcMain.handle('store:delete-task', (_, id) => {
    store.deleteTask(id)
    return { code: 0 }
  })

  ipcMain.handle('store:get-setting', (_, key) => {
    return { code: 0, data: store.getSetting(key) }
  })

  ipcMain.handle('store:set-setting', (_, key, value) => {
    store.setSetting(key, value)
    return { code: 0 }
  })

  ipcMain.handle('store:list-callback-logs', (_, limit) => {
    return { code: 0, data: store.listCallbackLogs(limit) }
  })
}

module.exports = registerHandlers
