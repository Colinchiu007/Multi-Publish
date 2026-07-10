/**
 * Scheduler — 定时发布
 * 持久化存储定时任务，到点自动提交到任务队列
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function getSchedulerPath () {
  return path.join(app.getPath('userData'), 'scheduled-tasks.jsonl')
}

let _timers = {}  // id → timeout handle
let _taskQueue = null

function setTaskQueue (taskQueue) {
  _taskQueue = taskQueue
}

/**
 * 创建定时发布任务
 */
function create (schedule) {
  const { platform, article, publishTime } = schedule
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  const entry = {
    id,
    platform,
    article,
    status: 'pending',
    publishTime,
    createdAt: new Date().toISOString()
  }

  // 持久化
  const filePath = getSchedulerPath()
  // R26 修复：appendFileSync 无 try/catch，磁盘满/权限拒绝会让 create() 抛错（与 apps/desktop 版对齐）
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (e) {
    console.error('[Scheduler] Failed to persist task ' + entry.id + ': ' + e.message)
  }

  // 注册定时器
  scheduleTimer(entry)
  return entry
}

/**
 * 注册单个定时器
 */
function scheduleTimer (entry) {
  const delay = new Date(entry.publishTime).getTime() - Date.now()
  // R26 修复：Invalid Date 导致 NaN，setTimeout(fn, NaN) 立即执行（与 apps/desktop 版对齐）
  if (!Number.isFinite(delay)) {
    console.warn('[Scheduler] Invalid publishTime for task ' + entry.id + ': ' + entry.publishTime)
    return
  }
  if (delay <= 0) return  // 已过期

  _timers[entry.id] = setTimeout(async () => {
    try {
      if (_taskQueue) {
        _taskQueue.add({ platform: entry.platform, article: entry.article })
        updateStatus(entry.id, 'executed')
      }
    } catch (e) {
      // 防止 unhandled rejection（async 回调的错误不会被 setTimeout 捕获）
      // R26 修复：updateStatus 裸调用无 try/catch，在 catch 块内再抛错会变成 unhandled exception
      try { updateStatus(entry.id, 'failed') } catch (e2) { /* ignore persistence error in failure path */ }
    }
    delete _timers[entry.id]
  }, delay)
  // R28 修复：unref 让定时器不阻止进程退出（与 apps/desktop 版同步，R26 副本一致性）
  if (_timers[entry.id] && _timers[entry.id].unref) _timers[entry.id].unref()
}

/**
 * R26/R28 同步：清理所有待执行的定时器（应用退出时调用）
 * 与 apps/desktop/electron/services/scheduler.js 的 stopAll 保持一致
 */
function stopAll () {
  for (const id of Object.keys(_timers)) {
    clearTimeout(_timers[id])
    delete _timers[id]
  }
}

/**
 * 更新持久化任务状态
 */
function updateStatus (id, status) {
  const filePath = getSchedulerPath()
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
  const updated = lines.map(line => {
    try {
      const entry = JSON.parse(line)
      if (entry.id === id) entry.status = status
      return JSON.stringify(entry)
    } catch { return line }
  })
  // 安全修复：定时任务全文重写原子写（原非原子写中断丢失全部定时发布任务）
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, updated.join('\n') + '\n', 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

/**
 * 列出定时任务
 */
function list () {
  const filePath = getSchedulerPath()
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
  return lines.map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

/**
 * 取消定时任务
 */
function cancel (id) {
  if (_timers[id]) {
    clearTimeout(_timers[id])
    delete _timers[id]
  }
  updateStatus(id, 'cancelled')
  return true
}

/**
 * 应用启动时恢复所有待执行的定时任务
 */
function restore () {
  const tasks = list().filter(t => t.status === 'pending')
  tasks.forEach(entry => scheduleTimer(entry))
  return tasks.length
}

module.exports = { setTaskQueue, create, list, cancel, restore, stopAll }