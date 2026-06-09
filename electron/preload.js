const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // 发布 API
  publishWechat: (articleData) => ipcRenderer.invoke('publish:wechat', articleData),
  publishBatch: (platforms, article) => ipcRenderer.invoke('publish:batch', { platforms, article }),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),

  // 队列 API
  queueStatus: () => ipcRenderer.invoke('queue:status'),
  queueHistory: () => ipcRenderer.invoke('queue:history'),

  // 发布历史 API
    historyList: (opts) => ipcRenderer.invoke('history:list', opts),
    historyGet: (id) => ipcRenderer.invoke('history:get', id),

    // 定时发布 API
    schedulerCreate: (schedule) => ipcRenderer.invoke('scheduler:create', schedule),
    schedulerList: () => ipcRenderer.invoke('scheduler:list'),
    schedulerCancel: (id) => ipcRenderer.invoke('scheduler:cancel', id),

  // ─── 账号管理 API ─────────────────────
  accountAdd: (platform) => ipcRenderer.invoke('account:add', platform),
  accountDelete: (accountId) => ipcRenderer.invoke('account:delete', accountId),
  accountCheckLogin: (platform, accountId) => ipcRenderer.invoke('account:check-login', { platform, accountId }),
  accountList: () => ipcRenderer.invoke('account:list'),

  // 进度监听
  onProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('publish:progress', handler)
    return () => ipcRenderer.removeListener('publish:progress', handler)
  }
})