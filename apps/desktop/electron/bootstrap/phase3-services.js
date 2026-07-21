// @ts-check
/**
 * Phase 3: 服务初始化（app.whenReady 后）
 *
 * 从 bootstrap.js runWhenReady 拆出：
 * - usageTracker / store.init / publishIntervalGuard
 * - taskQueue.setStateSaver / callbackServer.start
 * - scheduler.restore / taskQueue.deserialize
 * - keywordMonitor.onAlert + 持久化定时器
 * - login status monitor / analytics providers / cloudPublisher
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 <= 80 行（注释/空行不计）
 */
const log = require('../services/logger')

/**
 * @param {unknown} value
 * @returns {string}
 */
function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

/**
 * @param {Array<() => unknown | Promise<unknown>>} cleanups
 * @returns {Promise<void>}
 */
async function runCleanups(cleanups) {
  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    try {
      await cleanups[index]()
    } catch (e) {
      log.warn('App', 'Phase 3 rollback failed: ' + errorMessage(e))
    }
  }
}

/**
 * 初始化所有异步服务（app.whenReady 后调用）
 * @param {object} deps
 * @param {object} deps.container - DI 容器（获取 publishIntervalGuard）
 * @param {object} deps.usageTracker - 使用量统计服务
 * @param {object} deps.store - Store 实例
 * @param {object} deps.taskQueue - 任务队列
 * @param {object} deps.callbackServer - 回调服务器
 * @param {object} deps.scheduler - 调度器
 * @param {object} deps.keywordMonitor - 关键词监控
 * @param {object} deps.analyticsService - 分析服务
 * @param {{setAuthService?: (service: object|null) => void}} deps.pythonBridge - Python 后端桥接
 * @param {new (options: {orchestratorUrl: string, store: object}) => {registerIpcHandlers(): void}} deps.CloudPublisher - 云端发布构造函数
 * @param {Function} deps.getMainWin - 获取主窗口函数
 * @param {Function} [deps.createIdentityService] - 用户身份服务工厂
 */
async function startServices({ container, usageTracker, store, taskQueue, callbackServer, scheduler,
  keywordMonitor, analyticsService, pythonBridge, CloudPublisher, getMainWin, createIdentityService }) {
  /** @type {Array<() => unknown | Promise<unknown>>} */
  const cleanups = []
  let rollbackPromise = null
  const rollback = () => {
    if (!rollbackPromise) rollbackPromise = runCleanups(cleanups)
    return rollbackPromise
  }

  try {
    usageTracker.trackSession()

    cleanups.push(() => { if (store.close) store.close() })
    store.init()
    const _publishIntervalGuard = container.get('publishIntervalGuard')

    cleanups.push(() => { if (taskQueue.setStateSaver) taskQueue.setStateSaver(null) })
    taskQueue.setStateSaver((jsonStr) => {
      if (typeof store.setUserSetting === 'function') {
        store.setUserSetting('task_queue_state', jsonStr)
      } else {
        store.setSetting('task_queue_state', jsonStr)
      }
    })

    try {
      await callbackServer.start((data) => {
        const win = getMainWin()
        if (win && !win.isDestroyed()) win.webContents.send('callback:received', data)
        if (data) store.addCallbackLog(data.type || 'unknown', data.source || data.platform, data)
      })
      cleanups.push(() => callbackServer.stop && callbackServer.stop())
    } catch (e) {
      log.warn('App', 'Callback server failed to start (port may be in use): ' + errorMessage(e))
    }

    cleanups.push(() => { if (scheduler.stopAll) scheduler.stopAll() })

    const unsubscribeAlert = keywordMonitor.onAlert((keyword, current, previous, ratio) => {
      const win = getMainWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('notification', {
          type: 'keyword-spike',
          title: '[Spike] ' + keyword + ': ' + previous + ' -> ' + current + ' (' + ratio.toFixed(1) + 'x)',
          keyword, current, previous,
        })
      }
    })
    if (typeof unsubscribeAlert === 'function') cleanups.push(unsubscribeAlert)

    const keywordPersistTimer = setInterval(() => {
      try {
        const state = keywordMonitor.getAllHistories()
        if (typeof store.setUserSetting === 'function') {
          store.setUserSetting('keyword_monitor_state', JSON.stringify(state))
        } else {
          store.setSetting('keyword_monitor_state', JSON.stringify(state))
        }
      } catch (e) {
        log.warn('App', 'Keyword monitor persist error: ' + errorMessage(e))
      }
    }, 5 * 60 * 1000)
    if (keywordPersistTimer.unref) keywordPersistTimer.unref()
    cleanups.push(() => clearInterval(keywordPersistTimer))

    let loginStatusMonitor = null
    try {
      const { createLoginStatusMonitor } = require('../services/login-status-monitor')
      const accountManager = require('../publishers/account-manager')
      loginStatusMonitor = createLoginStatusMonitor({
        store, accountManager, intervalMs: 30 * 60 * 1000, getMainWin,
      })
      cleanups.push(() => loginStatusMonitor && loginStatusMonitor.stop && loginStatusMonitor.stop())
      loginStatusMonitor.start()
      log.info('App', 'Login status monitor started (F1.3, 30min interval)')
    } catch (e) {
      log.warn('App', 'Login status monitor failed to start: ' + errorMessage(e))
    }

    try {
      const { xiaohongshuProvider, douyinProvider } = require('../services/analytics-providers')
      analyticsService.registerProvider('xiaohongshu', xiaohongshuProvider)
      analyticsService.registerProvider('douyin', douyinProvider)
      log.info('App', 'Analytics providers registered: xiaohongshu, douyin')
    } catch (e) {
      log.warn('App', 'Failed to register analytics providers: ' + errorMessage(e))
    }

    const identityModule = require('../services/identity/identity-service-factory')
    const identityFactory = createIdentityService || identityModule.createIdentityService
    let identityService = null
    try {
      identityService = await identityFactory({ env: process.env, store, getMainWin })
    } catch (error) {
      if (identityModule.enabled(process.env.IDENTITY_AUTH_REQUIRED)) throw error
      log.warn('Identity', 'Identity service disabled after initialization failure: ' + errorMessage(error))
    }
    if (identityService && typeof identityService.dispose === 'function') {
      cleanups.push(() => identityService.dispose())
    }
    const ownerSubjectProvider = identityService
      ? () => {
          const state = identityService.getState()
          return state && state.user ? state.user.sub : null
        }
      : null
    if (store && typeof store.setOwnerSubjectProvider === 'function') {
      store.setOwnerSubjectProvider(ownerSubjectProvider)
      cleanups.push(() => store.setOwnerSubjectProvider(null))
      const accountManager = require('../publishers/account-manager')
      if (typeof accountManager.setOwnerSubjectProvider === 'function') {
        accountManager.setOwnerSubjectProvider(ownerSubjectProvider)
        cleanups.push(() => accountManager.setOwnerSubjectProvider(null))
      }
    }

    if (scheduler && typeof scheduler.setOwnerSubjectProvider === 'function') {
      scheduler.setOwnerSubjectProvider(ownerSubjectProvider)
      cleanups.push(() => scheduler.setOwnerSubjectProvider(null))
    }
    if (taskQueue && typeof taskQueue.setOwnerSubjectProvider === 'function') {
      taskQueue.setOwnerSubjectProvider(ownerSubjectProvider)
      cleanups.push(() => taskQueue.setOwnerSubjectProvider(null))
    }

    const restoreForOwner = (state) => {
      if (!scheduler || typeof scheduler.restore !== 'function') return 0
      const subject = state && state.user && state.user.sub
      if (identityService && typeof subject !== 'string') return 0
      const restored = identityService ? scheduler.restore(subject) : scheduler.restore()
      if (restored > 0) log.info('Scheduler', 'Restored ' + restored + ' pending tasks')
      return restored
    }
    restoreForOwner(identityService && identityService.getState())

    const savedQueueState = typeof store.getUserSetting === 'function'
      ? store.getUserSetting('task_queue_state', null)
      : store.getSetting('task_queue_state')
    if (savedQueueState && taskQueue && typeof taskQueue.deserialize === 'function') {
      const recovered = taskQueue.deserialize(savedQueueState)
      if (recovered > 0) {
        log.info('App', 'Recovered ' + recovered + ' tasks from queue state')
        if (typeof store.setUserSetting === 'function') {
          store.setUserSetting('task_queue_state', null)
        } else {
          store.setSetting('task_queue_state', null)
        }
      }
    }

    if (identityService && typeof identityService.onStateChanged === 'function') {
      const unsubscribeIdentity = identityService.onStateChanged((state) => {
        restoreForOwner(state)
        if (taskQueue && typeof taskQueue.setOwnerSubjectProvider === 'function') {
          taskQueue.setOwnerSubjectProvider(ownerSubjectProvider)
        }
      })
      if (typeof unsubscribeIdentity === 'function') cleanups.push(unsubscribeIdentity)
    }
    if (pythonBridge && typeof pythonBridge.setAuthService === 'function') {
      pythonBridge.setAuthService(identityService)
      cleanups.push(() => pythonBridge.setAuthService(null))
    }

    const cloudPublisher = new CloudPublisher({
      orchestratorUrl: process.env.ORCHESTRATOR_URL || '',
      store,
      authService: identityService,
    })

    return { keywordPersistTimer, loginStatusMonitor, identityService, cloudPublisher, rollback }
  } catch (e) {
    await rollback()
    throw e
  }
}

module.exports = { startServices }
