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

function createConsoleLogger () {
  return {
    error: (scope, message) => console.error(`[${scope}] ${message}`),
    warn: (scope, message) => console.warn(`[${scope}] ${message}`)
  }
}

function getErrorMessage (error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeOwnerSubject (ownerSubject) {
  if (typeof ownerSubject !== 'string' || !ownerSubject.trim()) {
    throw new Error('登录会话缺少用户标识')
  }
  return ownerSubject.trim()
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

  function getSchedulerPath () {
    return path.join(app.getPath('userData'), 'scheduled-tasks.jsonl')
  }

  function setTaskQueue (nextTaskQueue) {
    taskQueue = nextTaskQueue
  }

  function setOwnerSubjectProvider (provider) {
    if (provider !== null && provider !== undefined && typeof provider !== 'function') {
      throw new TypeError('owner subject provider must be a function or null')
    }
    ownerSubjectProvider = provider || null
  }

  function resolveOwnerSubject (explicitOwnerSubject) {
    if (!ownerSubjectProvider) {
      return explicitOwnerSubject === undefined
        ? undefined
        : normalizeOwnerSubject(explicitOwnerSubject)
    }
    let currentOwner
    try {
      currentOwner = normalizeOwnerSubject(ownerSubjectProvider())
    } catch (_) {
      return null
    }
    if (explicitOwnerSubject !== undefined && normalizeOwnerSubject(explicitOwnerSubject) !== currentOwner) {
      return null
    }
    return currentOwner
  }

  function entryMatchesOwner (entry, ownerSubject) {
    if (ownerSubject === undefined) return entry.owner_subject === undefined || entry.owner_subject === null
    return entry.owner_subject === ownerSubject
  }

  function canDispatchEntry (entry) {
    if (!ownerSubjectProvider) return true
    const currentOwner = resolveOwnerSubject()
    return Boolean(currentOwner && entryMatchesOwner(entry, currentOwner))
  }

  function updateStatus (id, status, expectedStatus, ownerSubject) {
    const filePath = getSchedulerPath()
    if (!fs.existsSync(filePath)) return false

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
    let updatedTask = false
    const updated = lines.map(line => {
      try {
        const entry = JSON.parse(line)
        if (entry.id === id && entryMatchesOwner(entry, ownerSubject) &&
          (expectedStatus === undefined || entry.status === expectedStatus)) {
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

  function isTaskTracked (id) {
    return Boolean(timers[id]) || activeDispatches.has(id)
  }

  function waitForDispatchRetry (id, attempt) {
    return new Promise(resolve => {
      if (stopped) {
        resolve(false)
        return
      }

      const finish = (shouldRetry) => {
        clearTimeout(timer)
        if (timers[id] === timer) delete timers[id]
        retryWaiters.delete(id)
        resolve(shouldRetry)
      }
      const timer = setTimeout(
        () => finish(!stopped),
        DISPATCH_CLAIM_RETRY_DELAY * attempt
      )
      timers[id] = timer
      retryWaiters.set(id, () => finish(false))
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
        if (!await waitForDispatchRetry(entry.id, attempt)) return false
      }
    }
    return false
  }

  async function dispatch (entry, expectedStatus) {
    if (!canDispatchEntry(entry)) {
      logger.warn('Scheduler', 'Skipping scheduled task for inactive owner ' + entry.id)
      return
    }
    if (!await claimForDispatch(entry, expectedStatus) || stopped) return
    // claimForDispatch 的重试期间登录态可能已切换。此时将状态交还给原 owner，
    // 等其重新登录时 restore() 再注册，而不是让新用户会话继续派发。
    if (!canDispatchEntry(entry)) {
      try { updateStatus(entry.id, 'pending', 'dispatching', entry.owner_subject) } catch { /* 下次恢复时重试 */ }
      logger.warn('Scheduler', 'Deferred scheduled task after owner switched ' + entry.id)
      return
    }
    try {
      if (!taskQueue) throw new Error('Task queue is not configured')
      const accountId = entry.accountId ?? entry.article?.accountId ?? null
      const task = {
        platform: entry.platform,
        article: entry.article,
        ...(accountId === null ? {} : { accountId }),
        ...(entry.owner_subject === undefined ? {} : { owner_subject: entry.owner_subject }),
      }
      if (entry.owner_subject !== undefined) {
        if (ownerSubjectProvider && typeof taskQueue.addForOwner !== 'function') {
          throw new Error('任务队列不支持租户隔离入队')
        }
        if (typeof taskQueue.addForOwner === 'function') {
          await taskQueue.addForOwner(task, entry.owner_subject)
        } else {
          await taskQueue.add(task)
        }
      } else {
        await taskQueue.add(task)
      }
      if (!stopped) updateStatus(entry.id, 'executed', 'dispatching', entry.owner_subject)
    } catch (error) {
      logger.error('Scheduler', 'Failed to execute scheduled task ' + entry.id + ': ' + getErrorMessage(error))
      if (!stopped) {
        try { updateStatus(entry.id, 'failed', 'dispatching', entry.owner_subject) } catch { /* 忽略失败路径中的持久化异常 */ }
      }
    }
  }

  function startDispatch (entry, expectedStatus) {
    if (stopped || activeDispatches.has(entry.id)) return false
    if (timers[entry.id]) {
      clearTimeout(timers[entry.id])
      delete timers[entry.id]
    }

    const operation = dispatch(entry, expectedStatus)
      .catch(error => {
        logger.error('Scheduler', 'Unexpected scheduled task failure ' + entry.id + ': ' + getErrorMessage(error))
      })
      .finally(() => {
        activeDispatches.delete(entry.id)
      })
    activeDispatches.set(entry.id, operation)
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
    if (isTaskTracked(entry.id)) return true

    const armNextSegment = () => {
      const remaining = publishTimestamp - Date.now()
      if (remaining <= 0) {
        startDispatch(entry, expectedStatus)
        return
      }
      timers[entry.id] = setTimeout(armNextSegment, Math.min(remaining, MAX_TIMER_DELAY))
      if (timers[entry.id] && timers[entry.id].unref) timers[entry.id].unref()
    }

    armNextSegment()
    return true
  }

  function create (schedule) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
      throw new TypeError('任务参数必须是对象')
    }
    const { platform, article, publishTime } = schedule
    // 身份模式下 owner 只能来自可信 provider，忽略调用方携带的字段。
    // legacy 模式仍兼容历史调用方显式写入的 owner。
    const ownerSubject = ownerSubjectProvider
      ? resolveOwnerSubject()
      : resolveOwnerSubject(schedule.owner_subject)
    if (ownerSubject === null) throw new Error('登录会话缺少用户标识')
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
    const entry = {
      id,
      platform,
      article,
      accountId: schedule.accountId ?? article.accountId ?? null,
      ...(ownerSubject === undefined ? {} : { owner_subject: ownerSubject }),
      status: 'pending',
      publishTime,
      createdAt: new Date().toISOString()
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
      try { updateStatus(entry.id, 'failed', 'pending', entry.owner_subject) } catch { /* 保留原始定时器异常 */ }
      throw error
    }
    return entry
  }

  function list (ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    if (owner === null) return []
    const filePath = getSchedulerPath()
    if (!fs.existsSync(filePath)) return []
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
      return lines.map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(entry => entry && entryMatchesOwner(entry, owner))
    } catch (error) {
      logger.error('Scheduler', 'Failed to list scheduled tasks: ' + getErrorMessage(error))
      return []
    }
  }

  function cancel (id, ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    if (owner === null) return false
    // 先完成原子持久化，再清定时器；写盘失败时任务仍可执行，不会形成幽灵 pending。
    if (!updateStatus(id, 'cancelled', 'pending', owner)) return false
    const cancelRetry = retryWaiters.get(id)
    if (cancelRetry) cancelRetry()
    if (timers[id]) {
      clearTimeout(timers[id])
      delete timers[id]
    }
    return true
  }

  function restore (ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    if (owner === null) return 0
    const tasks = list(owner).filter(task => task.status === 'pending' || task.status === 'dispatching')
    let restored = 0
    for (const entry of tasks) {
      if (isTaskTracked(entry.id)) {
        restored += 1
        continue
      }

      let expectedStatus = entry.status
      if (entry.status === 'dispatching') {
        try {
          if (!updateStatus(entry.id, 'pending', 'dispatching', entry.owner_subject)) continue
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

  return { setTaskQueue, setOwnerSubjectProvider, create, list, cancel, restore, stopAll }
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
  setTaskQueue: (...args) => getDefaultScheduler().setTaskQueue(...args),
  setOwnerSubjectProvider: (...args) => getDefaultScheduler().setOwnerSubjectProvider(...args),
  create: (...args) => getDefaultScheduler().create(...args),
  list: (...args) => getDefaultScheduler().list(...args),
  cancel: (...args) => getDefaultScheduler().cancel(...args),
  restore: (...args) => getDefaultScheduler().restore(...args),
  stopAll: (...args) => getDefaultScheduler().stopAll(...args),
  createScheduler
}
