/**
 * monitor-preload.js — 分屏监控 View 预加载脚本
 *
 * 为 WebviewManager 的内嵌浏览器视图提供有限 IPC 桥接。
 * 仅暴露读取平台账号信息的能力，不暴露文件/进程等危险 API。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('multiPublishMonitor', {
  /** 获取当前页面 URL */
  getCurrentUrl: () => window.location.href,

  /** 通知主进程当前页面就绪 */
  reportReady: () => {
    ipcRenderer.send('monitor:page-ready', { url: window.location.href })
  },
})
