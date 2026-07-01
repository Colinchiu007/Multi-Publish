/**
 * auth-qrcode-preload.js — 扫码登录视图预加载脚本
 *
 * 提供页面内截图和 DOM 检测能力给主进程：
 * - 检测二维码元素变化
 * - 报告页面状态
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('multiPublishQrAuth', {
  /** 报告页面加载完成 */
  reportReady: () => {
    ipcRenderer.send('qrcode:page-ready', { url: window.location.href })
  },
})
