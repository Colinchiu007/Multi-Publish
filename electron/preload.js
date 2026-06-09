const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // 占位：后续添加发布相关 API
  // publish: (platform, articleData) => ipcRenderer.invoke('publish', platform, articleData),
  // onProgress: (callback) => ipcRenderer.on('publish:progress', (_, data) => callback(data))
})