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
  try { fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8'); } catch (e) { console.error('[Scheduler] Failed to persist task:', e.message); }

  // 注册定时器
  scheduleTimer(entry)
  return entry
}

/**
 * 注册单个定时器
 */
function scheduleTimer (entry) {
  const delay = new Date(entry.publishTime).getTime() - Date.now()
  if (delay <= 0) return  // 已过期

  _timers[entry.id] = setTimeout(async () => {
    if (_taskQueue) {
      _taskQueue.addTask({ platform: entry.platform, article: entry.article })
      updateStatus(entry.id, 'executed')
    }
    delete _timers[entry.id]
  }, delay)
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
  fs.writeFileSync(filePath, updated.join('\n') + '\n', 'utf-8')
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

module.exports = { setTaskQueue, create, list, cancel, restore }