module.exports = function registerHandlers(ipcMain, deps) {
  const { store } = deps
  const h = {
    'store:add-account': (_, a) => store.addAccount(a),
    'store:get-account': (_, id) => store.getAccount(id),
    'store:list-accounts': (_, p) => store.listAccounts(p),
    'store:delete-account': (_, id) => store.deleteAccount(id),
    'store:set-default-account': (_, {p,a}) => store.setDefaultAccount(p,a),
    'store:get-default-account': (_, p) => store.getDefaultAccount(p),
    'store:update-account': (_, {id,f}) => store.updateAccount(id,f),
    'store:add-publish-record': (_, r) => store.addPublishRecord(r),
    'store:list-publish-history': (_, o) => store.listPublishHistory(o),
    'store:get-publish-stats': () => store.getPublishStats(),
    'store:add-scheduled-task': (_, t) => store.addScheduledTask(t),
    'store:list-scheduled-tasks': () => store.listScheduledTasks(),
    'store:delete-task': (_, id) => store.deleteTask(id),
    'store:get-setting': (_, k) => store.getSetting(k),
    'store:set-setting': (_, k, v) => store.setSetting(k, v),
    'store:list-callback-logs': (_, l) => store.listCallbackLogs(l),
  }
  for (const [c, fn] of Object.entries(h)) ipcMain.handle(c, fn)
}
