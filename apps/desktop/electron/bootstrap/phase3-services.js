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
 * @param {new (options: {orchestratorUrl: string, store: object}) => {registerIpcHandlers(): void}} deps.CloudPublisher - 云端发布构造函数
 * @param {Function} deps.getMainWin - 获取主窗口函数
 */
async function startServices({ container, usageTracker, store, taskQueue, callbackServer, scheduler,
  keywordMonitor, analyticsService, CloudPublisher, getMainWin }) {
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
      store.setSetting('task_queue_state', jsonStr)
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
    const restored = scheduler.restore()
    if (restored > 0) log.info('Scheduler', 'Restored ' + restored + ' pending tasks')

    const savedState = store.getSetting('task_queue_state')
    if (savedState) {
      const recovered = taskQueue.deserialize(savedState)
      if (recovered > 0) {
        log.info('App', 'Recovered ' + recovered + ' tasks from queue state')
        store.setSetting('task_queue_state', null)
      }
    }

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
        store.setSetting('keyword_monitor_state', JSON.stringify(state))
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

    const cloudPublisher = new CloudPublisher({
      orchestratorUrl: process.env.ORCHESTRATOR_URL || '',
      store,
    })

    return { keywordPersistTimer, loginStatusMonitor, cloudPublisher, rollback }
  } catch (e) {
    await rollback()
    throw e
  }
}

module.exports = { startServices }
