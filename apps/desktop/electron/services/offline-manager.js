// @ts-check
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
const { LEGACY_OWNER_SUBJECT } = require("./store-schema")

const OFFLINE_CACHE_FILE = "offline-publish-cache.json"
let _isOffline = false
 
const _retryQueue = []
let _mainWin = null
let _taskQueue = null
let _ownerSubjectProvider = null

function isThenable(value) {
  return value && typeof value.then === "function"
}

function normalizeOwnerSubject(ownerSubject) {
  if (typeof ownerSubject !== "string" || !ownerSubject.trim()) {
    throw new Error("离线任务无法识别当前用户")
  }
  return ownerSubject.trim()
}

function getCurrentOwnerSubject() {
  if (!_ownerSubjectProvider) return undefined
  try {
    return normalizeOwnerSubject(_ownerSubjectProvider())
  } catch (_) {
    return null
  }
}

function taskBelongsToOwner(task, ownerSubject) {
  if (!task || typeof task !== "object") return false
  if (ownerSubject === undefined) {
    return task.owner_subject === undefined || task.owner_subject === null || task.owner_subject === LEGACY_OWNER_SUBJECT
  }
  return ownerSubject !== null && task.owner_subject === ownerSubject
}

function getCachePath() {
  let userDataDir
  try {
    userDataDir = require("electron").app.getPath("userData")
  // eslint-disable-next-line no-unused-vars
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
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    return null
  }
}

function setTaskQueue(tq) {
  _taskQueue = tq
}

function setOwnerSubjectProvider(provider) {
  if (provider !== null && provider !== undefined && typeof provider !== "function") {
    throw new TypeError("owner subject provider must be a function or null")
  }
  _ownerSubjectProvider = provider || null
}

function processCachedTasks() {
  if (!_taskQueue || _isOffline) return 0
  const ownerSubject = getCurrentOwnerSubject()
  if (ownerSubject === null) return 0
  const allTasks = loadAllCache()
  const tasks = allTasks.filter(task => taskBelongsToOwner(task, ownerSubject))
  if (tasks.length === 0) return 0
  let count = 0
  const remainingTasks = allTasks.filter(task => !taskBelongsToOwner(task, ownerSubject))
  tasks.forEach(function(task) {
    if (task.platform && task.article) {
      const payload = {
        platform: task.platform,
        article: task.article,
        accountId: task.accountId || null,
      }
      try {
        if (ownerSubject !== undefined) {
          if (typeof _taskQueue.addForOwner !== "function") {
            throw new Error("任务队列不支持租户隔离入队")
          }
          const enqueueResult = _taskQueue.addForOwner({ ...payload, owner_subject: ownerSubject }, ownerSubject)
          // 当前 TaskQueue 是同步入队。若未来改成异步，不能在 Promise 结果未知时删除缓存。
          if (isThenable(enqueueResult)) {
            Promise.resolve(enqueueResult).catch(error => {
              log.warn("offline", "Async re-queue failed: " + error.message)
            })
            throw new Error("任务队列重放必须同步完成")
          }
        } else {
          _taskQueue.add(payload)
        }
        count++
      } catch (error) {
        remainingTasks.push(task)
        log.warn("offline", "Failed to re-queue cached task: " + error.message)
      }
    } else {
      remainingTasks.push(task)
    }
  })
  saveCache(remainingTasks)
  log.info("offline", "Re-queued " + count + " cached tasks after network restored")
  return count
}

function clearAllCached() {
  const ownerSubject = getCurrentOwnerSubject()
  if (ownerSubject === null) return false
  return saveCache(loadAllCache().filter(task => !taskBelongsToOwner(task, ownerSubject)))
}


function isOffline() {
  return _isOffline
}

function loadAllCache() {
  try {
    const cachePath = getCachePath()
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, "utf8")
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (e) {
    log.error("offline", "Failed to load cache: " + e.message)
  }
  return []
}

function loadCache() {
  const ownerSubject = getCurrentOwnerSubject()
  if (ownerSubject === null) return []
  return loadAllCache().filter(task => taskBelongsToOwner(task, ownerSubject))
}

function saveCache(tasks) {
  try {
    const cachePath = getCachePath()
    const tmpPath = cachePath + ".tmp"
    fs.writeFileSync(tmpPath, JSON.stringify(tasks, null, 2))
    fs.renameSync(tmpPath, cachePath)
    return true
  } catch (e) {
    log.error("offline", "Failed to save cache: " + e.message)
    return false
  }
}

function addToCache(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) return false
  const ownerSubject = getCurrentOwnerSubject()
  if (ownerSubject === null) return false
  const tasks = loadAllCache()
  const { owner_subject: _untrustedOwner, ...safeTask } = task
  tasks.push({
    ...safeTask,
    ...(ownerSubject === undefined ? {} : { owner_subject: ownerSubject }),
    cachedAt: new Date().toISOString(),
  })
  return saveCache(tasks)
}

function clearSuccessfulTasks() {
  const ownerSubject = getCurrentOwnerSubject()
  if (ownerSubject === null) return []
  const tasks = loadAllCache()
  const pending = tasks.filter(function(task) {
    return !taskBelongsToOwner(task, ownerSubject) || !task.success
  })
  saveCache(pending)
  return pending.filter(task => taskBelongsToOwner(task, ownerSubject))
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
  // eslint-disable-next-line no-unused-vars
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
  setOwnerSubjectProvider: setOwnerSubjectProvider,
  processCachedTasks: processCachedTasks,
}
