/**
 * OfflineManager — 离线模式管理器
 *
 * 功能：
 * 1. 检测网络状态
 * 2. 缓存发布任务
 * 3. 网络恢复后自动重试
 */
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const log = require('./logger')

const OFFLINE_CACHE_FILE = 'offline-publish-cache.json'
let _mainWin = null
let _isOffline = false
let _retryQueue = []

/**
 * 获取离线缓存路径
 */
function getCachePath () {
  return path.join(app.getPath('userData'), OFFLINE_CACHE_FILE)
}

/**
 * 检查是否离线
 */
function isOffline () {
  return _isOffline
}

/**
 * 加载离线缓存
 */
function loadCache () {
  try {
    const cachePath = getCachePath()
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf8')
      return JSON.parse(data)
    }
  } catch (e) {
    log.error('offline', 'Failed to load cache:', e.message)
  }
  return []
}

/**
 * 保存离线缓存
 */
function saveCache (tasks) {
  try {
    const cachePath = getCachePath()
    fs.writeFileSync(cachePath, JSON.stringify(tasks, null, 2))
    return true
  } catch (e) {
    log.error('offline', 'Failed to save cache:', e.message)
    return false
  }
}

/**
 * 添加任务到离线缓存
 */
function addToCache (task) {
  const tasks = loadCache()
  tasks.push({
    ...task,
    cachedAt: new Date().toISOString(),
  })
  return saveCache(tasks)
}

/**
 * 清除已成功的任务
 */
function clearSuccessfulTasks () {
  const tasks = loadCache()
  const pending = tasks.filter(t => !t.success)
  saveCache(pending)
  return pending
}

/**
 * 网络状态变化时调用
 */
function onNetworkChange (isOffline) {
  const wasOffline = _isOffline
  _isOffline = isOffline

  if (wasOffline && !isOffline) {
    // 从离线恢复到在线
    log.info('offline', 'Network restored, processing cached tasks')
    retryCachedTasks()
  }
}

/**
 * 重试缓存的任务
 */
async function retryCachedTasks () {
  const tasks = loadCache()
  if (tasks.length === 0) return

  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('offline:retry', {
      count: tasks.length,
      tasks: tasks,
    })
  }
}

/**
 * 启动离线模式监控
 */
function startMonitoring (mainWin) {
  _mainWin = mainWin

  // 监听网络状态变化
  const { net } = require('electron')
  net.on('online', () => onNetworkChange(false))
  net.on('offline', () => onNetworkChange(true))

  // 初始状态
  _isOffline = !net.isConnected()
}

module.exports = {
  isOffline,
  loadCache,
  saveCache,
  addToCache,
  clearSuccessfulTasks,
  onNetworkChange,
  startMonitoring,
}