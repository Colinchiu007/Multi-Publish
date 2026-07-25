// @ts-check
/**
 * Scheduler — 定时发布的单一业务实现。
 * 运行环境依赖通过工厂注入，默认导出仍兼容 Electron 中的既有调用方式。
 */
const defaultFs = require('fs')
const path = require('path')
const MAX_TIMER_DELAY = 2_147_483_647
const DISPATCH_CLAIM_MAX_ATTEMPTS = 3
const DISPATCH_CLAIM_RETRY_DELAY = 100
const LEGACY_OWNER_SUBJECT = '__legacy__'

function normalizeOwnerSubject (value) {
  if (value === undefined) return LEGACY_OWNER_SUBJECT
  if (typeof value !== 'string' || !value.trim()) throw new Error('登录会话缺少用户标识')
  return value.trim()
}

function entryBelongsToOwner (entry, owner) {
  return !entry.owner_subject
    ? owner === LEGACY_OWNER_SUBJECT
    : entry.owner_subject === owner
}

function createConsoleLogger () {
  return {
    error: (scope, message) => console.error(`[${scope}] ${message}`),
    warn: (scope, message) => console.warn(`[${scope}] ${message}`)
  }
}

function getErrorMessage (error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 创建隔离的调度器实例。
 * @param {{ app: { getPath: (name: string) => string }, fs?: typeof defaultFs, logger?: { error: Function, warn: Function } }} dependencies
 */
function createScheduler ({ app, fs = defaultFs, logger = createConsoleLogger() }) {
  const timers = Object.create(null)
  const retryWaiters = new Map()
  const activeDispatches = new Map()
  let taskQueue = null
  let stopped = false
  let ownerSubjectProvider = null

  function resolveOwnerSubject (explicitOwner) {
    if (explicitOwner !== undefined) return normalizeOwnerSubject(explicitOwner)
    if (!ownerSubjectProvider) return LEGACY_OWNER_SUBJECT
    let owner
    try { owner = ownerSubjectProvider() } catch (_) { owner = null }
    return normalizeOwnerSubject(owner)
  }

  function setOwnerSubjectProvider (provider) {
    if (provider !== null && provider !== undefined && typeof provider !== 'function') {
      throw new TypeError('owner subject provider must be a function or null')
    }
    ownerSubjectProvider = provider || null
  }

  function taskKey (id, ownerSubject) {
    return `${resolveOwnerSubject(ownerSubject)}\u0000${String(id)}`
  }

  function getSchedulerPath () {
    return path.join(app.getPath('userData'), 'scheduled-tasks.jsonl')
  }

  function setTaskQueue (nextTaskQueue) {
    taskQueue = nextTaskQueue
  }

  function updateStatus (id, status, expectedStatus, ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    const filePath = getSchedulerPath()
    if (!fs.existsSync(filePath)) return false

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
    let updatedTask = false
    const updated = lines.map(line => {
      try {
        const entry = JSON.parse(line)
        if (entry.id === id && entryBelongsToOwner(entry, owner) && (expectedStatus === undefined || entry.status === expectedStatus)) {
          entry.status = status
          updatedTask = true
        }
        return JSON.stringify(entry)
      } catch {
        return line
      }
    })
    if (!updatedTask) return false
    const temporaryPath = filePath + '.tmp'
    fs.writeFileSync(temporaryPath, updated.join('\n') + '\n', 'utf-8')
    fs.renameSync(temporaryPath, filePath)
    return true
  }

  function isTaskTracked (id, ownerSubject) {
    const key = taskKey(id, ownerSubject)
    return Boolean(timers[key]) || activeDispatches.has(key)
  }

  function waitForDispatchRetry (id, attempt, ownerSubject) {
    const key = taskKey(id, ownerSubject)
    return new Promise(resolve => {
      if (stopped) {
        resolve(false)
        return
      }

      const finish = (shouldRetry) => {
        clearTimeout(timer)
        if (timers[key] === timer) delete timers[key]
        retryWaiters.delete(key)
        resolve(shouldRetry)
      }
      const timer = setTimeout(
        () => finish(!stopped),
        DISPATCH_CLAIM_RETRY_DELAY * attempt
      )
      timers[key] = timer
      retryWaiters.set(key, () => finish(false))
      if (timer && timer.unref) timer.unref()
    })
  }

  async function claimForDispatch (entry, expectedStatus) {
    for (let attempt = 1; attempt <= DISPATCH_CLAIM_MAX_ATTEMPTS; attempt += 1) {
      if (stopped) return false
      try {
        return updateStatus(entry.id, 'dispatching', expectedStatus, entry.owner_subject)
      } catch (error) {
        const message = getErrorMessage(error)
        if (attempt === DISPATCH_CLAIM_MAX_ATTEMPTS) {
          logger.error(
            'Scheduler',
            `Failed to persist dispatching state for task ${entry.id} after ${attempt} attempts: ${message}`
          )
          return false
        }
        logger.warn(
          'Scheduler',
          `Failed to persist dispatching state for task ${entry.id}; retry ${attempt}/${DISPATCH_CLAIM_MAX_ATTEMPTS}: ${message}`
        )
        if (!await waitForDispatchRetry(entry.id, attempt, entry.owner_subject)) return false
      }
    }
    return false
  }

  async function dispatch (entry, expectedStatus) {
    if (!await claimForDispatch(entry, expectedStatus) || stopped) return
    try {
      if (!taskQueue) throw new Error('Task queue is not configured')
      const queueTask = { platform: entry.platform, article: entry.article }
      if (entry.owner_subject && entry.owner_subject !== LEGACY_OWNER_SUBJECT) {
        queueTask.owner_subject = entry.owner_subject
      }
      await taskQueue.add(queueTask)
      if (!stopped) updateStatus(entry.id, 'executed', 'dispatching', entry.owner_subject)
    } catch (error) {
      logger.error('Scheduler', 'Failed to execute scheduled task ' + entry.id + ': ' + getErrorMessage(error))
      if (!stopped) {
        try { updateStatus(entry.id, 'failed', 'dispatching', entry.owner_subject) } catch { /* 忽略失败路径中的持久化异常 */ }
      }
    }
  }

  function startDispatch (entry, expectedStatus) {
    const key = taskKey(entry.id, entry.owner_subject)
    if (stopped || activeDispatches.has(key)) return false
    if (timers[key]) {
      clearTimeout(timers[key])
      delete timers[key]
    }

    const operation = dispatch(entry, expectedStatus)
      .catch(error => {
        logger.error('Scheduler', 'Unexpected scheduled task failure ' + entry.id + ': ' + getErrorMessage(error))
      })
      .finally(() => {
        activeDispatches.delete(key)
      })
    activeDispatches.set(key, operation)
    return true
  }

  function scheduleTimer (entry, expectedStatus = 'pending') {
    const publishTimestamp = new Date(entry.publishTime).getTime()
    if (!Number.isFinite(publishTimestamp)) {
      logger.warn('Scheduler', 'Invalid publishTime for task ' + entry.id + ': ' + entry.publishTime)
      return false
    }
    if (stopped) return false

    // restore 可能被重复调用；同一任务只允许有一个定时器或派发操作。
    if (isTaskTracked(entry.id, entry.owner_subject)) return true

    const armNextSegment = () => {
      const remaining = publishTimestamp - Date.now()
      if (remaining <= 0) {
        startDispatch(entry, expectedStatus)
        return
      }
      const key = taskKey(entry.id, entry.owner_subject)
      timers[key] = setTimeout(armNextSegment, Math.min(remaining, MAX_TIMER_DELAY))
      if (timers[key] && timers[key].unref) timers[key].unref()
    }

    armNextSegment()
    return true
  }

  function create (schedule, ownerSubject) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
      throw new TypeError('任务参数必须是对象')
    }
    const { platform, article, publishTime } = schedule
    if (typeof platform !== 'string' || !platform.trim()) {
      throw new TypeError('platform 必须是非空字符串')
    }
    if (!article || typeof article !== 'object' || Array.isArray(article)) {
      throw new TypeError('article 必须是对象')
    }
    const publishTimestamp = new Date(publishTime).getTime()
    if (!Number.isFinite(publishTimestamp) || publishTimestamp <= Date.now()) {
      throw new TypeError('publishTime 必须是有效的未来时间')
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const owner = resolveOwnerSubject(ownerSubject)
    const entry = {
      id,
      platform,
      article,
      status: 'pending',
      publishTime,
      createdAt: new Date().toISOString(),
      owner_subject: owner,
    }

    try {
      fs.appendFileSync(getSchedulerPath(), JSON.stringify(entry) + '\n', 'utf-8')
    } catch (error) {
      logger.error('Scheduler', 'Failed to persist task: ' + getErrorMessage(error))
      throw error
    }

    try {
      if (!scheduleTimer(entry)) throw new Error('无法注册定时任务')
    } catch (error) {
      try { updateStatus(entry.id, 'failed', 'pending', owner) } catch { /* 保留原始定时器异常 */ }
      throw error
    }
    return entry
  }

  function list (ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    const filePath = getSchedulerPath()
    if (!fs.existsSync(filePath)) return []
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
      return lines.map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(entry => entry && entryBelongsToOwner(entry, owner))
    } catch (error) {
      logger.error('Scheduler', 'Failed to list scheduled tasks: ' + getErrorMessage(error))
      return []
    }
  }

  function cancel (id, ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    // 先完成原子持久化，再清定时器；写盘失败时任务仍可执行，不会形成幽灵 pending。
    if (!updateStatus(id, 'cancelled', 'pending', owner)) return false
    const key = taskKey(id, owner)
    const cancelRetry = retryWaiters.get(key)
    if (cancelRetry) cancelRetry()
    if (timers[key]) {
      clearTimeout(timers[key])
      delete timers[key]
    }
    return true
  }

  function restore (ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    const tasks = list(owner).filter(task => task.status === 'pending' || task.status === 'dispatching')
    let restored = 0
    for (const entry of tasks) {
      if (isTaskTracked(entry.id, entry.owner_subject || owner)) {
        restored += 1
        continue
      }

      let expectedStatus = entry.status
      if (entry.status === 'dispatching') {
        try {
          if (!updateStatus(entry.id, 'pending', 'dispatching', entry.owner_subject || owner)) continue
          expectedStatus = 'pending'
        } catch (error) {
          // 若恢复时暂时无法写盘，到期认领仍会按 dispatching 状态进行有界重试。
          logger.warn('Scheduler', 'Failed to reset interrupted task ' + entry.id + ': ' + getErrorMessage(error))
        }
      }
      if (scheduleTimer(entry, expectedStatus)) restored += 1
    }
    return restored
  }

  function stopAll () {
    stopped = true
    for (const cancelRetry of retryWaiters.values()) cancelRetry()
    for (const id of Object.keys(timers)) {
      clearTimeout(timers[id])
      delete timers[id]
    }
    return Promise.allSettled([...activeDispatches.values()])
  }

  return { setOwnerSubjectProvider, setTaskQueue, create, list, cancel, restore, stopAll }
}

let defaultScheduler = null

function getDefaultScheduler () {
  if (!defaultScheduler) {
    const { app } = require('electron')
    defaultScheduler = createScheduler({ app })
  }
  return defaultScheduler
}

module.exports = {
  setOwnerSubjectProvider: (...args) => getDefaultScheduler().setOwnerSubjectProvider(...args),
  setTaskQueue: (...args) => getDefaultScheduler().setTaskQueue(...args),
  create: (...args) => getDefaultScheduler().create(...args),
  list: (...args) => getDefaultScheduler().list(...args),
  cancel: (...args) => getDefaultScheduler().cancel(...args),
  restore: (...args) => getDefaultScheduler().restore(...args),
  stopAll: (...args) => getDefaultScheduler().stopAll(...args),
  createScheduler
}
