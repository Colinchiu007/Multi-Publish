/**
 * creator.js — 博主监控的 preload 桥
 *
 * 与既有 aggregation 桥同构：只做通道转发，不含业务判断。
 *
 * ⚠ 两处都必须是字面量：
 *   ① 调用形如 `ipcRenderer.invoke('creator:xxx', ...)` —— check-ipc-bridge.js 的 RE2
 *      正则 `/\bipcRenderer\w*\.invoke\s*\(\s*['"]([^'"]+)['"]/g` 要求**标识符以
 *      ipcRenderer 开头**，且通道名必须是字面量；
 *   ② 形参名就叫 ipcRenderer —— 换成 renderer 会提不到通道，
 *      检查器会逐条报「Handler 已注册但 preload 未暴露」。
 *   改成 `const invoke = (ch, p) => ipcRenderer.invoke(ch, p)` 这类间接调用同样会被漏掉。
 *   可测性靠形参注入解决（调用方传 ipcRenderer），不靠间接调用。
 */
const { ipcRenderer } = require('electron')

function createCreatorApi (ipcRenderer) {
  return {
    creatorList: () => ipcRenderer.invoke('creator:list'),
    creatorFollow: (payload) => ipcRenderer.invoke('creator:follow', payload),
    creatorUnfollow: (payload) => ipcRenderer.invoke('creator:unfollow', payload),
    creatorToggle: (payload) => ipcRenderer.invoke('creator:toggle', payload),
    creatorCheckNow: (payload) => ipcRenderer.invoke('creator:check-now', payload),
    creatorDiscoveries: (payload) => ipcRenderer.invoke('creator:discoveries', payload),
    creatorCollect: (payload) => ipcRenderer.invoke('creator:collect', payload),
    creatorCollectOne: (payload) => ipcRenderer.invoke('creator:collect-one', payload),
    creatorSkipOne: (payload) => ipcRenderer.invoke('creator:skip-one', payload),
    creatorSendToWriter: (payload) => ipcRenderer.invoke('creator:send-to-writer', payload),
  }
}

module.exports = { createCreatorApi }