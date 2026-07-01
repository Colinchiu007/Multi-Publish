/**
 * PublishAlert — 发布结果告警系统
 * 
 * 触发条件：发布成功/失败时
 * 通知方式：
 *   1. 系统通知 (Notification API)
 *   2. 应用内声音 (Electron AudioContext 或直接 HTML5 Audio)
 *   3. 托盘图标闪烁
 *   4. 桌面通知持久化
 */
const path = require('path')
const { shell } = require('electron')
const fs = require('fs')

let soundCtx = null
let lastAlertTime = 0
const ALERT_COOLDOWN = 1000  // 1s 内不重复弹通知

/**
 * 获取声音文件路径
 */
function getSoundPath (type) {
  const base = path.join(__dirname, '..', 'src', 'assets', 'sounds')
  if (type === 'success') return path.join(base, 'success.wav')
  if (type === 'error') return path.join(base, 'error.wav')
  return path.join(base, 'success.wav')  // 默认
}

/**
 * 发送桌面通知
 */
function sendNotification (title, body, type) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: type === 'success' ? '🚀' : '⚠️' })
    }
  } catch (e) { /* 非浏览器环境忽略 */ }
}

/**
 * 播放提示音
 */
function playSound (type) {
  try {
    const audioPath = getSoundPath(type)
    if (fs.existsSync(audioPath)) {
      const { exec } = require('child_process')
      if (process.platform === 'win32') {
        exec(`start "" "${audioPath}"`, () => {})
      } else if (process.platform === 'darwin') {
        exec(`afplay "${audioPath}"`, () => {})
      } else {
        exec(`paplay "${audioPath}"`, () => {})
      }
    }
  } catch (e) { /* 无声环境忽略 */ }
}

/**
 * 在 Electron 主进程中调用——通过 IPC 转发到渲染进程
 */
function triggerAlert (eventType, details) {
  const now = Date.now()
  if (now - lastAlertTime < ALERT_COOLDOWN) return
  lastAlertTime = now

  const title = type === 'success' ? '🚀 发布成功' : '⚠️ 发布失败'
  const body = type === 'success'
    ? details?.message || `已在 ${details?.platform || ''} 发布成功`
    : details?.message || `${details?.platform || ''} 发布失败`

  sendNotification(title, body, type)
  playSound(type)
}

/**
 * 渲染进程中的 alert 触发器（通过 window.electronAPI）
 * 在 Publish.vue 中调用
 */
function alertPublish (title, body, type) {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      window.electronAPI.showNotification({ title, body, type })
    } catch (e) { /* fallback */ }
  }
  playSound(type)
}

module.exports = { triggerAlert, alertPublish }