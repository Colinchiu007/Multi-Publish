/**
 * creator.js — 博主监控的 preload 桥
 *
 * 与既有 aggregation 桥同构：只做通道转发，不含业务判断。
 * 渲染层拿不到任何 Node 能力，也拿不到 API Key 明文（主进程只回传
 * status 与 fingerprint）。
 */
const { ipcRenderer } = require('electron')

// 接收 ipcRenderer 而非直接解构，与 aggregation 桥保持同一形态：
// 便于单测注入替身，也避免在非 Electron 环境加载时拿到 undefined。
function createCreatorApi (renderer = ipcRenderer) {
  const invoke = (channel, payload) => renderer.invoke(channel, payload)
  return {
    creatorList: () => invoke('creator:list'),
    creatorFollow: (payload) => invoke('creator:follow', payload),
    creatorUnfollow: (payload) => invoke('creator:unfollow', payload),
    creatorToggle: (payload) => invoke('creator:toggle', payload),
    creatorCheckNow: (payload) => invoke('creator:check-now', payload),
    creatorDiscoveries: (payload) => invoke('creator:discoveries', payload),
    creatorCollect: (payload) => invoke('creator:collect', payload),
    creatorCollectOne: (payload) => invoke('creator:collect-one', payload),
    creatorSkipOne: (payload) => invoke('creator:skip-one', payload),
  }
}

module.exports = { createCreatorApi }