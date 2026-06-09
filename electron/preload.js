const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // 发布 API
  publishWechat: (articleData) => ipcRenderer.invoke('publish:wechat', articleData),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),

  // 进度监听
  onProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('publish:progress', handler)
    // 返回取消监听的函数
    return () => ipcRenderer.removeListener('publish:progress', handler)
  }
})