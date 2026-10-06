// @ts-check
/**
 * Scheduler — 定时发布的单一业务实现。
 * 运行环境依赖通过工厂注入，默认导出仍兼容 Electron 中的既有调用方式。
 */
const defaultFs = require('fs')
const path = require('path')
const { pruneTerminalEntries } = require('./scheduler-prune')
const { assertSchedulableInput } = require('./platform-schedule-create')
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
function createScheduler ({ app, fs = defaultFs, logger = createConsoleLogger(), onDispatchFailed = null }) {
  const timers = Object.create(null)
  const retryWaiters = new Map()
  const activeDispatches = new Map()
  let taskQueue = null
  let stopped = false
  let ownerSubjectProvider = null

  /**
   * 派发失败通知钩子。派发失败意味着「用户排的定时任务没发出去」——
   * 这是必须让用户知道的终态，不能只落日志（旧实现零可见性：状态变 failed，
   * 既无渲染层提示、也进不了发布历史，用户无从得知）。
   * 钩子缺失时静默降级，向后兼容既有调用方。
   */
  function notifyDispatchFailed (entry, reason, stage) {
    if (typeof onDispatchFailed !== 'function') return
    try {
      onDispatchFailed({
        id: entry.id,
        platform: entry.platform,
        accountId: entry.accountId ?? entry.article?.accountId ?? null,
        publishTime: entry.publishTime,
        reason: getErrorMessage(reason),
        stage
      })
    } catch (error) {
      // 通知钩子自身异常不得影响调度器主流程
      logger.warn('Scheduler', 'onDispatchFailed handler threw: ' + getErrorMessage(error))
    }
  }

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
          // 放弃认领 = 到点但未能入队，用户必须知情（否则任务静默消失）
          notifyDispatchFailed(entry, message, 'claim')
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
    // D1 修复：认领失败不得静默 return。CAS 起点（submitted/dispatching）与磁盘状态
    // 不一致时，claimForDispatch 会在前置判定处短路返回 false —— 记录会停在
    // pending/submitted，被 restore() 当 legacy 任务本地派发。此处显式置 failed
    // 并通知，杜绝「以为已排期、实际由本地触发」的静默回落。
    const claimed = await claimForDispatch(entry, expectedStatus)
    if (!claimed || stopped) {
      if (!claimed && !stopped) {
        try { updateStatus(entry.id, 'failed', expectedStatus, entry.owner_subject) } catch { /* ignore */ }
        notifyDispatchFailed(entry, '任务认领失败，未提交平台', 'claim-mismatch')
        logger.error('Scheduler', 'Failed to claim scheduled task ' + entry.id + ' for dispatch')
      }
      return
    }
    // claimForDispatch 的重试期间登录态可能已切换。此时把状态交还给原 owner，
    // 等其重新登录后再提交，而不是让新用户会话继续派发。
    // ⚠️ R4：不得回退成 'pending' —— 那是 legacy「本地派发」桶，等于重开本地兜底后门。
    // 改为 'submitted'：认领前并未触达平台，重提交是安全的。
    if (!canDispatchEntry(entry)) {
      try { updateStatus(entry.id, 'submitted', 'dispatching', entry.owner_subject) } catch { /* 下次恢复时重试 */ }
      logger.warn('Scheduler', 'Deferred scheduled task after owner switched ' + entry.id)
      return
    }
    try {
      if (!taskQueue) throw new Error('Task queue is not configured')
      const accountId = entry.accountId ?? entry.article?.accountId ?? null
      const task = {
        platform: entry.platform,
        article: entry.article,
        publishMode: 'scheduled',
        // 平台侧定时（2026-10-07）：把 publishTime 随任务带给 publisher，
        // 由 publisher 组装成该平台要求的定时字段（头条 timer_status/timer_time、
        // 抖音 timing、B站 dtime…）。平台服务器到点发布，应用关着也能发。
        publishTime: entry.publishTime,
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
      notifyDispatchFailed(entry, error, 'enqueue')
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
    // 身份模式下 owner 只能来自可信 provider，忽略调用方携带的字段。
    // legacy 模式仍兼容历史调用方显式写入的 owner。
    const ownerSubject = ownerSubjectProvider
      ? resolveOwnerSubject()
      : resolveOwnerSubject(schedule && typeof schedule === 'object' ? schedule.owner_subject : undefined)
    if (ownerSubject === null) throw new Error('登录会话缺少用户标识')

    // 入参校验 + 平台能力门禁 + 平台窗口校验（platform-schedule-create.js）。
    // 阻断必须发生在**落盘之前** —— 否则会留下不会被执行的 pending 记录。
    const { platform, article, publishTime } = assertSchedulableInput(schedule)

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

    // ── 平台侧定时：创建即把排期提交给平台 ──────────────────────
    // 旧语义是「武装本地定时器，到点再触发一次普通发布」。新语义下平台服务器
    // 自己负责到点发布，因此这里**不再武装本地定时器**（应用关着也能发），
    // 改为立即入队把 publishTime 带给 publisher，由它组装平台的定时字段。
    // 平台已受理的状态标记：submitted（区别于旧语义的 pending=等待本地定时器）

    // 平台已受理的状态标记：submitted（区别于旧语义的 pending=等待本地定时器）
    entry.status = 'submitted'
    try {
      updateStatus(entry.id, 'submitted', 'pending', entry.owner_subject)
    } catch (error) {
      // D1 修复：此处写失败不能只 warn。磁盘上仍是 'pending'，而 'pending' 在
      // restore() 里是「legacy 本地任务」桶 —— 若就此返回，用户以为已排期、
      // 实际下次启动会被本地定时器派发，正是本次架构变更要消灭的「静默回落本地」。
      // 因此：置 failed（阻止 restore 捡起）+ 通知失败 + 向上抛错。
      const message = getErrorMessage(error)
      logger.error('Scheduler', 'Failed to mark task submitted: ' + message)
      try { updateStatus(entry.id, 'failed', 'pending', entry.owner_subject) } catch { /* ignore */ }
      notifyDispatchFailed(entry, error, 'mark-submitted')
      throw new Error('定时任务状态持久化失败：' + message)
    }

    // 立即入队提交给平台（携带 publishTime）；失败按「提交失败」处理，
    // 不降级为本地兜底 —— 降级会让用户以为已排期而实际由本地触发。
    // CAS 起点必须是 'submitted'：上一行已把状态推进到该值，若仍按旧的
    // 'pending' 认领，claimForDispatch 会因状态不匹配而静默失败（任务永不提交）。
    const submission = startDispatch(entry, 'submitted')
    if (!submission) {
      try { updateStatus(entry.id, 'failed', 'submitted', entry.owner_subject) } catch { /* ignore */ }
      throw new Error('定时任务提交失败')
    }

    // 任务已落盘后才剪枝：剪枝是纯维护动作，失败不影响本次创建。
    try {
      const removed = pruneTerminalEntries(fs, getSchedulerPath())
      if (removed > 0) {
        logger.warn('Scheduler', 'Pruned ' + removed + ' expired scheduled task records')
      }
    } catch (error) {
      logger.warn('Scheduler', 'Failed to prune scheduled task records: ' + getErrorMessage(error))
    }
    return entry
  }

  function list (ownerSubject) {
    const owner = resolveOwnerSubject(ownerSubject)
    if (owner === null) throw new Error('登录会话缺少用户标识')
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
    if (owner === null) throw new Error('登录会话缺少用户标识')
    // D2 修复：正在向平台提交的任务不可取消。载荷一旦交给队列就无法收回，
    // 本地改判 cancelled 只会造成「本地显示已取消、平台已排期照发」的分裂 ——
    // 与 D1 同类的静默失败。原子性不变量「派发中的任务不可取消」对新语义同样成立。
    if (activeDispatches.has(id)) {
      logger.warn('Scheduler', 'Refusing to cancel in-flight platform submission ' + id)
      return false
    }
    // 平台侧定时（2026-10-07）：submitted / dispatching 都代表「排期已交平台」，
    // 本地记录作废即可让本系统不再认为它会发布。⚠️ 已提交到平台的排期是否真正撤销
    // 取决于平台是否提供撤销接口（参考产品实测：不提供）。UI 需如实标注，
    // 不能让用户以为「取消了就一定不会发」。
    const cancelled = updateStatus(id, 'cancelled', 'dispatching', owner)
      || updateStatus(id, 'cancelled', 'submitted', owner)
      || updateStatus(id, 'cancelled', 'pending', owner)
    if (!cancelled) return false
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
    if (owner === null) throw new Error('登录会话缺少用户标识')
    // 平台侧定时（2026-10-07）：submitted / dispatching 都代表「排期已提交给平台」，
    // 本地一律不得重放（否则平台侧出现两条排期）。只恢复 legacy 的 pending。
    const tasks = list(owner).filter(task => task.status === 'pending')
    let restored = 0
    for (const entry of tasks) {
      if (isTaskTracked(entry.id)) {
        restored += 1
        continue
      }

      // R3 清理：过滤条件已收窄为仅 'pending'，原 dispatching 重置分支永不可达
      // （保留会让人误以为「中断的提交会被重跑」，而新语义恰恰禁止重跑）。
      if (scheduleTimer(entry, entry.status)) restored += 1
    }
    return restored
  }

  /**
   * 强制按当前墙钟重算全部未到点任务的剩余延时。
   *
   * 为什么 restore() 不够：定时器在武装时把「墙钟目标」一次性换算成相对延时
   * （scheduleTimer → armNextSegment），此后只受 setTimeout 推进。系统休眠跨越
   * 到点时刻、或系统时钟被 NTP / 人工改动后，已武装的定时器不会重算——
   * 仅当任务跨越 MAX_TIMER_DELAY（≈24.86 天）分片边界才会被动纠正。
   * 而 restore() 见到 isTaskTracked 为真的任务会直接跳过，同样纠正不了。
   *
   * 做法：先解除全部定时器与认领重试等待，再走一次 restore 按新墙钟重新武装。
   * 已在派发中的任务由 activeDispatches 守卫，不会被重复派发。
   */
  function rearm (ownerSubject) {
    if (stopped) return 0
    const owner = resolveOwnerSubject(ownerSubject)
    if (owner === null) throw new Error('登录会话缺少用户标识')

    // 认领重试的等待者必须走 cancelRetry() 正常收束（否则 promise 悬空、永不 resolve）
    for (const cancelRetry of [...retryWaiters.values()]) cancelRetry()
    for (const id of Object.keys(timers)) {
      clearTimeout(timers[id])
      delete timers[id]
    }
    return restore(owner)
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

  return { setTaskQueue, setOwnerSubjectProvider, create, list, cancel, restore, rearm, stopAll }
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
  rearm: (...args) => getDefaultScheduler().rearm(...args),
  stopAll: (...args) => getDefaultScheduler().stopAll(...args),
  createScheduler
}
