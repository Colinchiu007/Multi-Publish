/**
 * preload 聚合入口（Phase 3.3）
 *
 * 从 electron 拿到 ipcRenderer，分别构造三个子模块的 API，
 * 合并后通过 contextBridge.exposeInMainWorld 暴露给渲染进程。
 *
 * 等价于原 preload.js 的 contextBridge.exposeInMainWorld('electronAPI', { ... })，
 * 但拆分为 publish / account / system 三个子模块，便于维护与测试。
 */
const { contextBridge, ipcRenderer } = require('electron')
const { createPublishApi } = require('./publish')
const { createAccountApi } = require('./account')
const { createSystemApi } = require('./system')

const api = {
  ...createPublishApi(ipcRenderer),
  ...createAccountApi(ipcRenderer),
  ...createSystemApi(ipcRenderer),
}

contextBridge.exposeInMainWorld('electronAPI', api)
