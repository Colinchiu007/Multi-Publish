/**
 * OfflineManager — 离线模式管理器
 *
 * 功能：
 * 1. 检测网络状态
 * 2. 缓存发布任务
 * 3. 网络恢复后通知前端重试
 * 4. 提供 IPC 接口供前端查询状态
 */

const fs = require("fs")
const path = require("path")
const log = require("./logger")

const OFFLINE_CACHE_FILE = "offline-publish-cache.json"
let _isOffline = false
const _retryQueue = []
let _mainWin = null
let _taskQueue = null

function getCachePath() {
  let userDataDir
  try {
    userDataDir = require("electron").app.getPath("userData")
  } catch (e) {
    userDataDir = process.env.USERPROFILE || "/tmp"
  }
  return path.join(userDataDir, OFFLINE_CACHE_FILE)
}

function getMainWindow() {
  if (_mainWin && !_mainWin.isDestroyed()) return _mainWin
  try {
    const wins = require("electron").BrowserWindow.getAllWindows()
    return wins[0] || null
  } catch (e) {
    return null
  }
}

function setTaskQueue(tq) {
  _taskQueue = tq
}

function processCachedTasks() {
  if (!_taskQueue || _isOffline) return 0
  const tasks = loadCache()
  if (tasks.length === 0) return 0
  let count = 0
  tasks.forEach(function(task) {
    if (task.platform && task.article) {
      _taskQueue.add({
        platform: task.platform,
        article: task.article,
        accountId: task.accountId || null,
      })
      count++
    }
  })
  saveCache([])
  log.info("offline", "Re-queued " + count + " cached tasks after network restored")
  return count
}

function clearAllCached() {
  saveCache([])
}


function isOffline() {
  return _isOffline
}

function loadCache() {
  try {
    const cachePath = getCachePath()
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, "utf8")
      return JSON.parse(data)
    }
  } catch (e) {
    log.error("offline", "Failed to load cache: " + e.message)
  }
  return []
}

function saveCache(tasks) {
  try {
    const cachePath = getCachePath()
    fs.writeFileSync(cachePath, JSON.stringify(tasks, null, 2))
    return true
  } catch (e) {
    log.error("offline", "Failed to save cache: " + e.message)
    return false
  }
}

function addToCache(task) {
  const tasks = loadCache()
  tasks.push({
    ...task,
    cachedAt: new Date().toISOString(),
  })
  return saveCache(tasks)
}

function clearSuccessfulTasks() {
  const tasks = loadCache()
  const pending = tasks.filter(function(t) { return !t.success })
  saveCache(pending)
  return pending
}

function onNetworkChange(isOffline) {
  const wasOffline = _isOffline
  _isOffline = isOffline
  if (wasOffline && !isOffline) {
    log.info("offline", "Network restored, processing cached tasks")
    processCachedTasks()
    notifyFrontend()
  }
}

function notifyFrontend() {
  const win = getMainWindow()
  if (win) {
    try {
      win.webContents.send("offline:restored", {
        cachedCount: loadCache().length,
      })
    } catch (e) {
      log.warn("offline", "Failed to notify frontend: " + e.message)
    }
  }
}

function startMonitoring(mainWin) {
  _mainWin = mainWin
  try {
    const net = require("electron").net
    if (net && typeof net.on === "function") {
      net.on("online", function() { onNetworkChange(false) })
      net.on("offline", function() { onNetworkChange(true) })
    }
    _isOffline = (typeof net.isConnected === "function") ? !net.isConnected() : false
  } catch (e) {
    _isOffline = false
  }
}

function getStatus() {
  return {
    offline: _isOffline,
    cachedCount: loadCache().length,
    cachedTasks: loadCache(),
  }
}

module.exports = {
  isOffline: isOffline,
  loadCache: loadCache,
  saveCache: saveCache,
  addToCache: addToCache,
  clearSuccessfulTasks: clearSuccessfulTasks,
  clearAllCached: clearAllCached,
  onNetworkChange: onNetworkChange,
  startMonitoring: startMonitoring,
  getStatus: getStatus,
  setTaskQueue: setTaskQueue,
  processCachedTasks: processCachedTasks,
}
