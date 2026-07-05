/**
 * PublishAlert — 发布结果告警系统（改进版）
 *
 * 功能：
 * 1. 系统通知 (Notification API)
 * 2. 应用内声音提示
 * 3. 通知历史记录
 * 4. 通知冷却期（避免重复弹出）
 */
const path = require('path')
const fs = require('fs')
const log = require('./logger')

const soundCtx = null
let lastAlertTime = 0
const ALERT_COOLDOWN = 1000

/**
 * 获取声音文件路径
 */
function getSoundPath (type) {
  const base = path.join(__dirname, '..', '..', 'src', 'assets', 'sounds')
  if (type === 'success') return path.join(base, 'success.wav')
  if (type === 'error') return path.join(base, 'error.wav')
  return path.join(base, 'success.wav')
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
 * 发送系统通知
 */
function sendNotification (title, body) {
  try {
    const { Notification } = require('electron')
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body, silent: true })
    notification.show()
    log.info('publishAlert', `${title}: ${body}`)
  } catch { /* 非 Electron 环境忽略 */ }
}

/**
 * 主进程中的 alert 触发器
 */
function triggerAlert (eventType, details) {
  const now = Date.now()
  if (now - lastAlertTime < ALERT_COOLDOWN) return
  lastAlertTime = now

  const type = details?.success ? 'success' : 'error'
  const title = type === 'success' ? '🚀 发布成功' : '⚠️ 发布失败'
  const body = details?.success
    ? details?.message || `已在 ${details?.platform || ''} 发布成功`
    : details?.message || `${details?.platform || ''} 发布失败`

  sendNotification(title, body)
  playSound(type)
}

module.exports = { triggerAlert, playSound, sendNotification }